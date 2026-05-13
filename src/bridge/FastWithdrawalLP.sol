// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title FastWithdrawalLP
 * @notice Liquidity providers front L2→L1 withdrawals so users skip the 7-day
 *         OP Stack challenge period. The LP earns a fee (configurable, default 0.1%).
 *
 * Flow:
 *  1. User initiates withdrawal on L2 (burn tokens, queue cross-domain message).
 *  2. User calls `claimFastWithdrawal(token, amount, to, withdrawalHash)` on L1.
 *  3. An LP with enough liquidity fills the claim instantly for (amount - fee).
 *  4. When the 7-day challenge settles, the LP calls `settleWithdrawal(hash)` to
 *     recoup their capital from the bridge's finalized release.
 *
 * Security:
 *  - Each withdrawal hash can only be claimed once.
 *  - LP deposits are ring-fenced per LP address; one LP's insolvency doesn't
 *    affect another.
 *  - 33% of fast-withdrawal fees route to the UBI pool (GoodDollar principle).
 */

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract FastWithdrawalLP {
    // ─── State ────────────────────────────────────────────────────────────────

    address public admin;
    address public ubiPool;

    /// @notice Fee in basis points (default 10 = 0.1%)
    uint256 public feeBps;

    /// @notice Fraction of fee sent to UBI pool (3333 = 33.33%)
    uint256 public constant UBI_FEE_SHARE = 3333; // out of 10000

    /// @notice LP liquidity per (lp, token)
    mapping(address => mapping(address => uint256)) public lpBalance;

    /// @notice Total liquidity deposited per token across all LPs
    mapping(address => uint256) public totalLiquidity;

    /// @notice ETH liquidity per LP
    mapping(address => uint256) public lpETHBalance;
    uint256 public totalETHLiquidity;

    struct Claim {
        address lp;          // LP who fronted the withdrawal
        address token;       // address(0) for ETH
        uint256 amount;      // gross amount (before fee)
        bool settled;        // true once LP recouped from bridge
    }

    /// @notice Withdrawal hash → claim info
    mapping(bytes32 => Claim) public claims;

    /// @notice Track which hashes have been claimed (prevent double-claim)
    mapping(bytes32 => bool) public claimed;

    bool private _locked;

    // ─── Events ───────────────────────────────────────────────────────────────

    event LiquidityDeposited(address indexed lp, address indexed token, uint256 amount);
    event LiquidityWithdrawn(address indexed lp, address indexed token, uint256 amount);
    event FastClaimed(
        bytes32 indexed withdrawalHash,
        address indexed user,
        address indexed lp,
        address token,
        uint256 grossAmount,
        uint256 netAmount,
        uint256 fee
    );
    event WithdrawalSettled(bytes32 indexed withdrawalHash, address indexed lp, uint256 amount);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error ZeroAmount();
    error ZeroAddress();
    error NotAdmin();
    error AlreadyClaimed();
    error NoLiquidityAvailable();
    error InsufficientLPBalance();
    error AlreadySettled();
    error NotClaimed();
    error TransferFailed();
    error Reentrant();
    error InvalidFeeBps();

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier nonReentrant() {
        if (_locked) revert Reentrant();
        _locked = true;
        _;
        _locked = false;
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(address _admin, address _ubiPool, uint256 _feeBps) {
        if (_admin == address(0)) revert ZeroAddress();
        if (_ubiPool == address(0)) revert ZeroAddress();
        if (_feeBps > 500) revert InvalidFeeBps(); // max 5%

        admin = _admin;
        ubiPool = _ubiPool;
        feeBps = _feeBps;
    }

    // ─── LP Liquidity Management ──────────────────────────────────────────────

    /// @notice Deposit ERC20 liquidity to serve fast withdrawals.
    function depositLiquidity(address token, uint256 amount) external {
        if (token == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        bool ok = IERC20(token).transferFrom(msg.sender, address(this), amount);
        if (!ok) revert TransferFailed();

        lpBalance[msg.sender][token] += amount;
        totalLiquidity[token] += amount;

        emit LiquidityDeposited(msg.sender, token, amount);
    }

    /// @notice Deposit ETH liquidity.
    function depositETHLiquidity() external payable {
        if (msg.value == 0) revert ZeroAmount();

        lpETHBalance[msg.sender] += msg.value;
        totalETHLiquidity += msg.value;

        emit LiquidityDeposited(msg.sender, address(0), msg.value);
    }

    /// @notice Withdraw idle ERC20 liquidity (not locked in pending claims).
    function withdrawLiquidity(address token, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (lpBalance[msg.sender][token] < amount) revert InsufficientLPBalance();

        lpBalance[msg.sender][token] -= amount;
        totalLiquidity[token] -= amount;

        bool ok = IERC20(token).transfer(msg.sender, amount);
        if (!ok) revert TransferFailed();

        emit LiquidityWithdrawn(msg.sender, token, amount);
    }

    /// @notice Withdraw idle ETH liquidity.
    function withdrawETHLiquidity(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (lpETHBalance[msg.sender] < amount) revert InsufficientLPBalance();

        lpETHBalance[msg.sender] -= amount;
        totalETHLiquidity -= amount;

        (bool ok, ) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();

        emit LiquidityWithdrawn(msg.sender, address(0), amount);
    }

    // ─── Fast Withdrawal Claim ────────────────────────────────────────────────

    /// @notice User claims a fast ERC20 withdrawal. Any LP with enough balance is selected.
    /// @param token The L1 token address
    /// @param amount The gross withdrawal amount (before fee)
    /// @param to Recipient on L1
    /// @param withdrawalHash Unique hash identifying the L2 withdrawal
    function claimFastWithdrawal(
        address token,
        uint256 amount,
        address to,
        bytes32 withdrawalHash
    ) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (to == address(0)) revert ZeroAddress();
        if (claimed[withdrawalHash]) revert AlreadyClaimed();

        // Find an LP with enough balance (caller can be the LP themselves)
        address lp = _findLP(token, amount);
        if (lp == address(0)) revert NoLiquidityAvailable();

        claimed[withdrawalHash] = true;

        // Calculate fee
        uint256 fee = (amount * feeBps) / 10000;
        uint256 netAmount = amount - fee;
        uint256 ubiFee = (fee * UBI_FEE_SHARE) / 10000;
        uint256 lpFee = fee - ubiFee;

        // Deduct from LP balance (gross amount — LP gets fee back on settlement)
        lpBalance[lp][token] -= amount;
        totalLiquidity[token] -= amount;

        // Pay user net amount
        bool ok = IERC20(token).transfer(to, netAmount);
        if (!ok) revert TransferFailed();

        // Pay UBI fee
        if (ubiFee > 0) {
            ok = IERC20(token).transfer(ubiPool, ubiFee);
            if (!ok) revert TransferFailed();
        }

        // LP fee stays in contract, credited back on settlement
        // Store claim for settlement
        claims[withdrawalHash] = Claim({
            lp: lp,
            token: token,
            amount: amount,
            settled: false
        });

        // Credit LP fee immediately (they earned it)
        lpBalance[lp][token] += lpFee;
        totalLiquidity[token] += lpFee;

        emit FastClaimed(withdrawalHash, to, lp, token, amount, netAmount, fee);
    }

    /// @notice User claims a fast ETH withdrawal.
    function claimFastETHWithdrawal(
        uint256 amount,
        address to,
        bytes32 withdrawalHash
    ) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (to == address(0)) revert ZeroAddress();
        if (claimed[withdrawalHash]) revert AlreadyClaimed();

        address lp = _findETHLP(amount);
        if (lp == address(0)) revert NoLiquidityAvailable();

        claimed[withdrawalHash] = true;

        uint256 fee = (amount * feeBps) / 10000;
        uint256 netAmount = amount - fee;
        uint256 ubiFee = (fee * UBI_FEE_SHARE) / 10000;
        uint256 lpFee = fee - ubiFee;

        lpETHBalance[lp] -= amount;
        totalETHLiquidity -= amount;

        // Pay user
        (bool ok, ) = to.call{value: netAmount}("");
        if (!ok) revert TransferFailed();

        // Pay UBI
        if (ubiFee > 0) {
            (ok, ) = ubiPool.call{value: ubiFee}("");
            if (!ok) revert TransferFailed();
        }

        claims[withdrawalHash] = Claim({
            lp: lp,
            token: address(0),
            amount: amount,
            settled: false
        });

        lpETHBalance[lp] += lpFee;
        totalETHLiquidity += lpFee;

        emit FastClaimed(withdrawalHash, to, lp, address(0), amount, netAmount, fee);
    }

    // ─── Settlement (after 7-day challenge) ───────────────────────────────────

    /// @notice LP reclaims capital after the bridge finalizes the withdrawal on L1.
    ///         The LP must have received the tokens from the bridge finalization
    ///         and deposits them back here to restore their balance.
    /// @param withdrawalHash The withdrawal hash that was fast-claimed
    /// @param amount The amount received from bridge finalization
    function settleWithdrawal(bytes32 withdrawalHash, uint256 amount) external nonReentrant {
        Claim storage c = claims[withdrawalHash];
        if (c.lp == address(0)) revert NotClaimed();
        if (c.settled) revert AlreadySettled();
        if (msg.sender != c.lp) revert NotAdmin(); // only the LP can settle

        c.settled = true;

        if (c.token == address(0)) {
            // ETH settlement — LP sends ETH back
            // The amount they get from bridge finalization restores their position
            lpETHBalance[c.lp] += amount;
            totalETHLiquidity += amount;
        } else {
            // ERC20 settlement
            bool ok = IERC20(c.token).transferFrom(msg.sender, address(this), amount);
            if (!ok) revert TransferFailed();
            lpBalance[c.lp][c.token] += amount;
            totalLiquidity[c.token] += amount;
        }

        emit WithdrawalSettled(withdrawalHash, c.lp, amount);
    }

    /// @notice ETH settlement variant — LP sends ETH to restore position.
    function settleETHWithdrawal(bytes32 withdrawalHash) external payable nonReentrant {
        Claim storage c = claims[withdrawalHash];
        if (c.lp == address(0)) revert NotClaimed();
        if (c.settled) revert AlreadySettled();
        if (msg.sender != c.lp) revert NotAdmin();
        if (c.token != address(0)) revert TransferFailed(); // must be ETH claim

        c.settled = true;

        lpETHBalance[c.lp] += msg.value;
        totalETHLiquidity += msg.value;

        emit WithdrawalSettled(withdrawalHash, c.lp, msg.value);
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    function setFeeBps(uint256 _feeBps) external onlyAdmin {
        if (_feeBps > 500) revert InvalidFeeBps();
        feeBps = _feeBps;
    }

    function setUBIPool(address _ubiPool) external onlyAdmin {
        if (_ubiPool == address(0)) revert ZeroAddress();
        ubiPool = _ubiPool;
    }

    function setAdmin(address _admin) external onlyAdmin {
        if (_admin == address(0)) revert ZeroAddress();
        admin = _admin;
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    /// @dev Simple LP selection: caller is preferred if they have enough, else
    ///      we return address(0) (no automatic search to keep gas bounded).
    ///      In production, an off-chain keeper would specify the LP address.
    function _findLP(address token, uint256 amount) internal view returns (address) {
        if (lpBalance[msg.sender][token] >= amount) return msg.sender;
        return address(0);
    }

    function _findETHLP(uint256 amount) internal view returns (address) {
        if (lpETHBalance[msg.sender] >= amount) return msg.sender;
        return address(0);
    }

    // ─── Receive ──────────────────────────────────────────────────────────────

    receive() external payable {}
}
