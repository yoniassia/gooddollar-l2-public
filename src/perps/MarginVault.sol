// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MarginVault
 * @notice Holds G$ margin collateral for GoodPerps perpetual futures.
 *         Only the PerpEngine can debit/credit balances.
 */

interface IMarginToken {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}

contract MarginVault {
    // ============ State ============

    IMarginToken public immutable collateral;
    address public perpEngine;
    address public admin;
    address public pendingAdmin;

    mapping(address => uint256) public balances;
    uint256 public totalDeposited;

    // ============ Events ============

    event AdminTransferInitiated(address indexed previousAdmin, address indexed pendingAdmin);
    event AdminTransferred(address indexed previousAdmin, address indexed newAdmin);
    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event EngineDebit(address indexed user, uint256 amount);
    event EngineCredit(address indexed user, uint256 amount);

    // ============ Errors ============

    error NotAdmin();
    error NotPendingAdmin();
    error NotEngine();
    error ZeroAddress();
    error ZeroAmount();
    error InsufficientBalance(uint256 have, uint256 need);
    error TransferFailed();

    // ============ Modifiers ============

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    modifier onlyEngine() {
        if (msg.sender != perpEngine) revert NotEngine();
        _;
    }

    // ============ Constructor ============

    constructor(address _collateral, address _admin) {
        if (_collateral == address(0)) revert ZeroAddress();
        if (_admin == address(0)) revert ZeroAddress();
        collateral = IMarginToken(_collateral);
        admin = _admin;
    }

    // ============ Setup ============

    function setPerpEngine(address engine) external onlyAdmin {
        if (engine == address(0)) revert ZeroAddress();
        perpEngine = engine;
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        if (newAdmin == address(0)) revert ZeroAddress();
        pendingAdmin = newAdmin;
        emit AdminTransferInitiated(admin, newAdmin);
    }

    function acceptAdmin() external {
        if (msg.sender != pendingAdmin) revert NotPendingAdmin();
        address previous = admin;
        admin = pendingAdmin;
        pendingAdmin = address(0);
        emit AdminTransferred(previous, admin);
    }

    // ============ User ============

    function deposit(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        bool ok = collateral.transferFrom(msg.sender, address(this), amount);
        if (!ok) revert TransferFailed();
        balances[msg.sender] += amount;
        totalDeposited += amount;
        emit Deposited(msg.sender, amount);
    }

    function withdraw(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        if (balances[msg.sender] < amount) revert InsufficientBalance(balances[msg.sender], amount);
        balances[msg.sender] -= amount;
        totalDeposited -= amount;
        bool ok = collateral.transfer(msg.sender, amount);
        if (!ok) revert TransferFailed();
        emit Withdrawn(msg.sender, amount);
    }

    // ============ Engine-Only ============

    /// @notice Debit margin (PnL loss, fee, funding payment)
    function debit(address user, uint256 amount) external onlyEngine {
        if (balances[user] < amount) revert InsufficientBalance(balances[user], amount);
        balances[user] -= amount;
        totalDeposited -= amount;
        emit EngineDebit(user, amount);
    }

    /// @notice Credit margin (PnL profit, funding receipt)
    function credit(address user, uint256 amount) external onlyEngine {
        balances[user] += amount;
        totalDeposited += amount;
        emit EngineCredit(user, amount);
    }

    /// @notice Transfer from one user to another (used for liquidation rewards)
    function transfer(address from, address to, uint256 amount) external onlyEngine {
        if (balances[from] < amount) revert InsufficientBalance(balances[from], amount);
        balances[from] -= amount;
        balances[to] += amount;
    }

    /// @notice Transfer fee tokens out of the vault to an external recipient.
    ///         Called by PerpEngine to forward collected trade fees to the UBI
    ///         fee splitter. Tokens were previously debited from user balances
    ///         via debit() and are now unaccounted-for in totalDeposited.
    function flushFee(address to, uint256 amount) external onlyEngine {
        if (to == address(0)) revert ZeroAddress();
        bool ok = collateral.transfer(to, amount);
        if (!ok) revert TransferFailed();
    }
}
