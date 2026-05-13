// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title PegStabilityModule (PSM)
 * @notice Allows USDC ↔ gUSD swaps at near-1:1 parity with a small fee (default 10 bps = 0.1%).
 *
 * Decimal handling:
 *   USDC  : 6 decimals
 *   gUSD  : 18 decimals
 *   Conversion: 1 USDC (1e6) == 1 gUSD (1e18) in value
 *               scale factor = 1e12
 *
 * Fee routing:
 *   Fees collected in gUSD are forwarded to UBIFeeSplitter.splitFeeToken()
 *   with this contract as dApp recipient (fees go back to PSM liquidity reserve).
 *
 * Capital model:
 *   - USDC deposited in swaps is held as backing reserves.
 *   - gUSD is minted on demand for USDC→gUSD and burned on gUSD→USDC.
 *   - Admin can withdraw surplus USDC (over backing) for yield strategies.
 */

import "./interfaces/IGoodStable.sol";

/// @dev Alias for readability — IgUSD has all needed methods
interface IgUSDMinter is IgUSD {}

/**
 * @notice Enhanced UBIFeeSplitter interface for better minting fee tracking.
 *         Only implemented by StableUBIFeeSplitter, not the standard UBIFeeSplitter.
 */
interface IStableUBIFeeSplitterEnhanced {
    function splitMintingFee(
        uint256 totalFee,
        address dAppRecipient,
        address token,
        address user,
        string calldata direction
    ) external returns (uint256 ubiShare, uint256 protocolShare, uint256 dAppShare);
}

interface IUSDC {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function decimals() external view returns (uint8);
}

contract PegStabilityModule {
    // ============ Constants ============

    uint256 public constant BPS            = 10_000;
    uint256 public constant USDC_DECIMALS  = 6;
    uint256 public constant GUSD_DECIMALS  = 18;
    /// @dev Scaling factor: 1e18 / 1e6 = 1e12
    uint256 public constant SCALE          = 1e12;

    // ============ State ============

    IgUSDMinter     public immutable gusd;
    IUSDC           public immutable usdc;
    IUBIFeeSplitter public immutable feeSplitter;

    address public admin;
    uint256 public feeBPS;          // default 10 = 0.1%
    uint256 public swapCap;         // max USDC reserves; 0 = unlimited
    bool    public paused;

    // Stats
    uint256 public totalUSDCReserves;
    uint256 public totalFeesCollected;
    /// @dev Gross gUSD ever minted by this PSM (never decremented on redemption).
    ///      Used with psmBurnedGUSD to compute outstanding PSM-backed gUSD for
    ///      the withdrawReserves solvency check.
    ///      Note: The PSM accepts redemptions from ANY gUSD holder (including
    ///      VaultManager-minted gUSD). We cannot distinguish origins at burn time,
    ///      so psmMintedGUSD is conservatively kept as gross issuance. This means
    ///      withdrawReserves may be more restrictive than necessary after cross-origin
    ///      redemptions, but it guarantees admin cannot drain reserves while original
    ///      PSM users still hold unredeemed gUSD.
    uint256 public psmMintedGUSD;
    /// @dev Gross gUSD burned by this PSM (all swapGUSDForUSDC redemptions, regardless
    ///      of whether the gUSD was originally minted by this PSM or by VaultManager).
    ///      Outstanding PSM-backed gUSD = max(0, psmMintedGUSD - psmBurnedGUSD).
    uint256 public psmBurnedGUSD;

    // ============ Reentrancy ============

    uint256 private _locked;
    modifier nonReentrant() {
        require(_locked == 0, "Reentrant");
        _locked = 1;
        _;
        _locked = 0;
    }

    // ============ Events ============

    event SwapUSDCForGUSD(address indexed user, uint256 usdcIn, uint256 gusdOut, uint256 fee);
    event SwapGUSDForUSDC(address indexed user, uint256 gusdIn, uint256 usdcOut, uint256 fee);
    event FeeBPSUpdated(uint256 oldBPS, uint256 newBPS);
    event SwapCapUpdated(uint256 cap);
    event Paused(bool status);
    event AdminTransferred(address indexed oldAdmin, address indexed newAdmin);

    // ============ Constructor ============

    constructor(
        address _gusd,
        address _usdc,
        address _feeSplitter,
        address _admin
    ) {
        require(_gusd         != address(0), "PSM: zero gUSD");
        require(_usdc         != address(0), "PSM: zero USDC");
        require(_feeSplitter  != address(0), "PSM: zero splitter");
        require(_admin        != address(0), "PSM: zero admin");

        gusd         = IgUSDMinter(_gusd);
        usdc         = IUSDC(_usdc);
        feeSplitter  = IUBIFeeSplitter(_feeSplitter);
        admin        = _admin;
        feeBPS       = 10; // 0.1%
    }

    /**
     * @notice Helper function to call enhanced minting fee tracking.
     *         Attempts to use StableUBIFeeSplitter.splitMintingFee() if available.
     * @dev This is called via try/catch to maintain compatibility with standard UBIFeeSplitter.
     */
    function _callMintingFeeTracking(
        uint256 fee,
        address dAppRecipient,
        address token,
        address user,
        string calldata direction
    ) external {
        require(msg.sender == address(this), "PSM: only self");

        // Attempt enhanced tracking call (only works with StableUBIFeeSplitter)
        try IStableUBIFeeSplitterEnhanced(address(feeSplitter)).splitMintingFee(
            fee,
            dAppRecipient,
            token,
            user,
            direction
        ) returns (uint256, uint256, uint256) {
            // Enhanced tracking succeeded
        } catch {
            // This will revert, causing the try/catch in swap functions to use fallback
            revert("Enhanced tracking not supported");
        }
    }

    // ============ Modifiers ============

    modifier onlyAdmin() {
        require(msg.sender == admin, "PSM: not admin");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "PSM: paused");
        _;
    }

    // ============ Admin ============

    function setFeeBPS(uint256 _feeBPS) external onlyAdmin {
        require(_feeBPS <= 200, "PSM: fee too high"); // max 2%
        emit FeeBPSUpdated(feeBPS, _feeBPS);
        feeBPS = _feeBPS;
    }

    function setSwapCap(uint256 _cap) external onlyAdmin {
        swapCap = _cap;
        emit SwapCapUpdated(_cap);
    }

    function setPaused(bool _paused) external onlyAdmin {
        paused = _paused;
        emit Paused(_paused);
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "PSM: zero address");
        emit AdminTransferred(admin, newAdmin);
        admin = newAdmin;
    }

    /**
     * @notice Withdraw USDC reserves to a recipient (e.g., for yield strategy).
     *         Cannot withdraw below the amount needed to back outstanding gUSD.
     */
    function withdrawReserves(address to, uint256 usdcAmount) external onlyAdmin {
        require(to != address(0), "PSM: zero address");
        require(usdcAmount <= totalUSDCReserves, "PSM: exceeds reserves");
        // Enforce minimum backing: remaining reserves must cover outstanding PSM-backed gUSD.
        // outstandingGUSD = gross minted - gross burned (clamped to 0).
        // We use gross issuance for psmMintedGUSD (never decremented) because the PSM accepts
        // redemptions from any gUSD holder and cannot distinguish PSM-originated from
        // VaultManager-originated gUSD at burn time. Conservatively, all minted gUSD is
        // treated as outstanding until explicitly burned through this PSM.
        uint256 outstanding = psmMintedGUSD > psmBurnedGUSD ? psmMintedGUSD - psmBurnedGUSD : 0;
        uint256 minUSDC = outstanding / SCALE;
        require(totalUSDCReserves - usdcAmount >= minUSDC, "PSM: undercollateralized");
        totalUSDCReserves -= usdcAmount;
        require(usdc.transfer(to, usdcAmount), "PSM: transfer failed");
    }

    // ============ Swaps ============

    /**
     * @notice Swap USDC for gUSD.
     *         User sends `usdcAmount` (6-decimal), receives gUSD minus fee (18-decimal).
     *
     * @param usdcAmount Amount of USDC to deposit (6 decimals)
     */
    function swapUSDCForGUSD(uint256 usdcAmount) external nonReentrant whenNotPaused {
        require(usdcAmount > 0, "PSM: zero amount");

        // Enforce cap if set
        if (swapCap > 0) {
            require(totalUSDCReserves + usdcAmount <= swapCap, "PSM: swap cap reached");
        }

        // Pull USDC from user
        require(
            usdc.transferFrom(msg.sender, address(this), usdcAmount),
            "PSM: USDC transfer failed"
        );
        totalUSDCReserves += usdcAmount;

        // Convert to 18-decimal gUSD equivalent
        uint256 gusdEquivalent = usdcAmount * SCALE;

        // Calculate fee in gUSD terms
        uint256 fee = (gusdEquivalent * feeBPS) / BPS;
        uint256 gusdOut = gusdEquivalent - fee;

        require(gusdOut > 0, "PSM: output too small");

        // Mint gUSD to user
        gusd.mint(msg.sender, gusdOut);
        psmMintedGUSD += gusdOut;

        // Mint fee gUSD and route through UBIFeeSplitter
        if (fee > 0) {
            gusd.mint(address(this), fee);
            gusd.approve(address(feeSplitter), fee);

            // Try enhanced minting fee tracking if supported (StableUBIFeeSplitter)
            try this._callMintingFeeTracking(fee, address(this), address(gusd), msg.sender, "USDC-to-gUSD") {
                // Enhanced tracking succeeded
            } catch {
                // Fallback to standard method for backward compatibility
                feeSplitter.splitFeeToken(fee, address(this), address(gusd));
            }
            totalFeesCollected += fee;
        }

        emit SwapUSDCForGUSD(msg.sender, usdcAmount, gusdOut, fee);
    }

    /**
     * @notice Swap gUSD for USDC.
     *         User sends `gusdAmount` (18-decimal), receives USDC minus fee (6-decimal).
     *
     * @param gusdAmount Amount of gUSD to redeem (18 decimals)
     */
    function swapGUSDForUSDC(uint256 gusdAmount) external nonReentrant whenNotPaused {
        require(gusdAmount > 0, "PSM: zero amount");

        // Calculate fee in gUSD
        uint256 fee    = (gusdAmount * feeBPS) / BPS;
        uint256 netGUSD = gusdAmount - fee;

        // Convert net gUSD to USDC (6-decimal)
        uint256 usdcOut = netGUSD / SCALE;
        require(usdcOut > 0, "PSM: output too small");
        require(totalUSDCReserves >= usdcOut, "PSM: insufficient reserves");

        // Pull full gUSD from user
        require(
            gusd.transferFrom(msg.sender, address(this), gusdAmount),
            "PSM: gUSD transfer failed"
        );

        // Burn the net gUSD (backing the USDC we're releasing)
        gusd.burn(netGUSD);
        // Increment gross-burned counter. We cannot know whether the burned gUSD was
        // minted by this PSM or by VaultManager, so we track all burns here and let
        // withdrawReserves use max(0, psmMintedGUSD - psmBurnedGUSD) as the outstanding
        // minimum. This conservatively bounds admin withdrawals to true surplus only.
        psmBurnedGUSD += netGUSD;

        // Route fee through UBIFeeSplitter
        if (fee > 0) {
            gusd.approve(address(feeSplitter), fee);

            // Try enhanced minting fee tracking if supported (StableUBIFeeSplitter)
            try this._callMintingFeeTracking(fee, address(this), address(gusd), msg.sender, "gUSD-to-USDC") {
                // Enhanced tracking succeeded
            } catch {
                // Fallback to standard method for backward compatibility
                feeSplitter.splitFeeToken(fee, address(this), address(gusd));
            }
            totalFeesCollected += fee;
        }

        totalUSDCReserves -= usdcOut;
        require(usdc.transfer(msg.sender, usdcOut), "PSM: USDC transfer failed");

        emit SwapGUSDForUSDC(msg.sender, gusdAmount, usdcOut, fee);
    }

    // ============ Views ============

    /**
     * @notice Preview gUSD out for a given USDC input (after fee).
     */
    function previewUSDCForGUSD(uint256 usdcAmount) external view returns (uint256 gusdOut, uint256 fee) {
        uint256 gusdEquivalent = usdcAmount * SCALE;
        fee    = (gusdEquivalent * feeBPS) / BPS;
        gusdOut = gusdEquivalent - fee;
    }

    /**
     * @notice Preview USDC out for a given gUSD input (after fee).
     */
    function previewGUSDForUSDC(uint256 gusdAmount) external view returns (uint256 usdcOut, uint256 fee) {
        fee    = (gusdAmount * feeBPS) / BPS;
        usdcOut = (gusdAmount - fee) / SCALE;
    }
}
