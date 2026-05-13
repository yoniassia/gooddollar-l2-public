// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title UBI Fee Splitter
 * @notice Every dApp on GoodDollar L2 routes fees through this contract.
 *         A percentage of ALL fees goes to the UBI pool.
 * @dev dApps call `splitFee()` (for G$) or `splitFeeToken()` (any ERC-20) to
 *      automatically route the UBI portion.
 */
import "./interfaces/IGoodDollarToken.sol";

interface IERC20Transfer {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

contract UBIFeeSplitter {
    IGoodDollarToken public goodDollar;

    // Fee split configuration (in basis points, 10000 = 100%)
    uint256 public ubiBPS = 3333;      // 33.33% to UBI pool
    uint256 public protocolBPS = 1667; // 16.67% to protocol treasury
    // Remaining 50% goes back to the dApp (liquidity providers, lenders, etc.)

    address public protocolTreasury;
    address public admin;

    /// @notice The only address allowed to call releaseToUBI() (typically UBIClaimV2).
    address public ubiClaimContract;

    /// @notice Where non-G$ UBI shares (e.g. gUSD) are sent.
    ///         Defaults to address(0) (no-op) until set by admin.
    address public ubiRecipient;
    
    // Registered dApps
    mapping(address => bool) public registeredDApps;
    address[] public dAppList;
    
    // Stats
    uint256 public totalFeesCollected;
    uint256 public totalUBIFunded;
    
    event FeeSplit(
        address indexed dApp,
        uint256 totalFee,
        uint256 ubiShare,
        uint256 protocolShare,
        uint256 dAppShare
    );
    event DAppRegistered(address indexed dApp, string name);
    event GoodDollarUpdated(address indexed oldAddr, address indexed newAddr);
    
    modifier onlyAdmin() {
        require(msg.sender == admin, "Not admin");
        _;
    }
    
    constructor(address _goodDollar, address _treasury, address _admin) {
        goodDollar = IGoodDollarToken(_goodDollar);
        protocolTreasury = _treasury;
        admin = _admin;
        ubiRecipient = _treasury; // fallback — admin should update via setUBIRecipient()
    }
    
    /**
     * @notice Split a fee payment. Called by dApps after collecting fees.
     * @param totalFee Total fee amount in G$
     * @param dAppRecipient Where to send the dApp's share
     * @return ubiShare Amount sent to UBI pool
     * @return protocolShare Amount sent to protocol treasury  
     * @return dAppShare Amount sent to dApp
     */
    function splitFee(uint256 totalFee, address dAppRecipient) external returns (
        uint256 ubiShare,
        uint256 protocolShare,
        uint256 dAppShare
    ) {
        require(totalFee > 0, "Zero fee");
        
        // Calculate shares
        ubiShare = (totalFee * ubiBPS) / 10000;
        protocolShare = (totalFee * protocolBPS) / 10000;
        dAppShare = totalFee - ubiShare - protocolShare;
        
        // Transfer from sender
        goodDollar.transferFrom(msg.sender, address(this), totalFee);
        
        // Route to destinations
        goodDollar.fundUBIPool(ubiShare);
        require(goodDollar.transfer(protocolTreasury, protocolShare), "transfer failed");
        require(goodDollar.transfer(dAppRecipient, dAppShare), "transfer failed");
        
        // Update stats
        totalFeesCollected += totalFee;
        totalUBIFunded += ubiShare;
        
        emit FeeSplit(msg.sender, totalFee, ubiShare, protocolShare, dAppShare);
    }
    
    /**
     * @notice Register a dApp. For tracking and governance.
     */
    function registerDApp(address dApp, string calldata dAppName) external onlyAdmin {
        if (!registeredDApps[dApp]) {
            registeredDApps[dApp] = true;
            dAppList.push(dApp);
            emit DAppRegistered(dApp, dAppName);
        }
    }
    
    // ============ Governance ============
    
    function setFeeSplit(uint256 _ubiBPS, uint256 _protocolBPS) external onlyAdmin {
        require(_ubiBPS + _protocolBPS <= 10000, "Exceeds 100%");
        ubiBPS = _ubiBPS;
        protocolBPS = _protocolBPS;
    }
    
    function setTreasury(address _treasury) external onlyAdmin {
        protocolTreasury = _treasury;
    }

    function setUBIRecipient(address _ubiRecipient) external onlyAdmin {
        require(_ubiRecipient != address(0), "zero address");
        ubiRecipient = _ubiRecipient;
    }

    function setUBIClaimContract(address _ubiClaimContract) external onlyAdmin {
        require(_ubiClaimContract != address(0), "zero address");
        ubiClaimContract = _ubiClaimContract;
    }

    /// @notice Update the GoodDollar token address. Required when GDT is redeployed
    ///         (e.g. after devnet resets). Immutability prevented live updates — GOO-402.
    function setGoodDollar(address _goodDollar) external onlyAdmin {
        require(_goodDollar != address(0), "zero address");
        address old = address(goodDollar);
        goodDollar = IGoodDollarToken(_goodDollar);
        emit GoodDollarUpdated(old, _goodDollar);
    }

    /**
     * @notice Token-agnostic fee split. Use this when fees are denominated in any
     *         ERC-20 other than G$ (e.g. gUSD from VaultManager stability fees).
     *         UBI share is transferred to `ubiRecipient`; protocol and dApp shares
     *         go to their respective addresses. Does NOT call fundUBIPool().
     * @param totalFee  Fee amount in `token` units.
     * @param dAppRecipient Where the dApp's share is sent.
     * @param token     The ERC-20 token in which the fee is denominated.
     */
    function splitFeeToken(
        uint256 totalFee,
        address dAppRecipient,
        address token
    ) external returns (uint256 ubiShare, uint256 protocolShare, uint256 dAppShare) {
        require(totalFee > 0, "Zero fee");
        require(ubiRecipient != address(0), "ubiRecipient not set");

        ubiShare = (totalFee * ubiBPS) / 10000;
        protocolShare = (totalFee * protocolBPS) / 10000;
        dAppShare = totalFee - ubiShare - protocolShare;

        IERC20Transfer t = IERC20Transfer(token);
        require(t.transferFrom(msg.sender, address(this), totalFee), "transferFrom failed");
        require(t.transfer(ubiRecipient, ubiShare), "transfer failed");
        require(t.transfer(protocolTreasury, protocolShare), "transfer failed");
        require(t.transfer(dAppRecipient, dAppShare), "transfer failed");

        totalFeesCollected += totalFee;

        emit FeeSplit(msg.sender, totalFee, ubiShare, protocolShare, dAppShare);
    }

    /**
     * @notice Transfer G$ held by this contract to `recipient` for UBI pool funding.
     *         Restricted to ubiClaimContract (UBIClaimV2) only — prevents arbitrary
     *         callers from draining accumulated G$ to attacker-controlled addresses.
     * @param recipient Where to send the G$ (typically UBIClaimV2 itself).
     * @param amount    Amount to transfer. Must be ≤ claimableBalance().
     */
    function releaseToUBI(address recipient, uint256 amount) external {
        require(msg.sender == ubiClaimContract, "Not UBIClaim");
        require(amount <= goodDollar.balanceOf(address(this)), "insufficient balance");
        require(goodDollar.transfer(recipient, amount), "transfer failed");
    }

    /**
     * @notice Accept native ETH fee payments.
     *         LiFiBridgeAggregator.initiateSwapETH routes a fee in ETH here.
     *         The ETH is held until withdrawn by admin or swept to treasury.
     */
    receive() external payable {}

    /**
     * @notice Withdraw accumulated native ETH to the protocol treasury.
     */
    function withdrawETH() external onlyAdmin {
        uint256 balance = address(this).balance;
        require(balance > 0, "no ETH");
        (bool sent,) = protocolTreasury.call{value: balance}("");
        require(sent, "ETH transfer failed");
    }

    function dAppCount() external view returns (uint256) {
        return dAppList.length;
    }

    /**
     * @notice Returns the G$ balance held in this contract available for UBI claims.
     *         UBIClaimV2 queries this to determine if supplemental pool funds are ready.
     */
    function claimableBalance() external view returns (uint256) {
        return goodDollar.balanceOf(address(this));
    }
}
