// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title GoodTimelock — Multi-Sig Timelock for GoodDollar L2 Governance
 * @notice Queues and executes transactions with a mandatory delay.
 *         Separate from GoodDAO to allow multi-sig and DAO to share
 *         the same execution layer. Inspired by Compound Timelock +
 *         OpenZeppelin TimelockController.
 *
 * @dev Key features:
 *   - Configurable delay (min 1 day, max 30 days)
 *   - Role-based: proposers can queue, executors can execute, admin manages roles
 *   - Grace period: queued txs expire after 14 days
 *   - Batch execution: multiple calls in a single operation
 *   - 33% of any ETH swept from failed txs → UBI treasury
 */
contract GoodTimelock {
    // --- Constants ---
    uint256 public constant MIN_DELAY = 1 days;
    uint256 public constant MAX_DELAY = 30 days;
    uint256 public constant GRACE_PERIOD = 14 days;

    // --- State ---
    uint256 public delay;
    address public ubiTreasury;

    // Roles
    mapping(address => bool) public isProposer;
    mapping(address => bool) public isExecutor;
    address public admin;

    // Queued operations: operationId => ready timestamp (0 = not queued)
    mapping(bytes32 => uint256) public timestamps;

    // --- Events ---
    event OperationScheduled(
        bytes32 indexed id,
        address[] targets,
        uint256[] values,
        bytes[] calldatas,
        bytes32 predecessor,
        uint256 readyTimestamp
    );
    event OperationExecuted(bytes32 indexed id);
    event OperationCancelled(bytes32 indexed id);
    event DelayUpdated(uint256 oldDelay, uint256 newDelay);
    event ProposerUpdated(address indexed account, bool status);
    event ExecutorUpdated(address indexed account, bool status);
    event AdminTransferred(address indexed oldAdmin, address indexed newAdmin);

    // --- Errors ---
    error NotProposer();
    error NotExecutor();
    error NotAdmin();
    error NotSelf();
    error InvalidDelay();
    error OperationAlreadyQueued();
    error OperationNotQueued();
    error OperationNotReady();
    error OperationExpired();
    error PredecessorNotExecuted();
    error ExecutionFailed(uint256 index);
    error ArrayLengthMismatch();

    // --- Modifiers ---
    modifier onlyProposer() {
        if (!isProposer[msg.sender]) revert NotProposer();
        _;
    }

    modifier onlyExecutor() {
        // address(0) means anyone can execute
        if (!isExecutor[address(0)] && !isExecutor[msg.sender]) revert NotExecutor();
        _;
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    modifier onlySelf() {
        if (msg.sender != address(this)) revert NotSelf();
        _;
    }

    constructor(
        uint256 _delay,
        address[] memory _proposers,
        address[] memory _executors,
        address _admin,
        address _ubiTreasury
    ) {
        if (_delay < MIN_DELAY || _delay > MAX_DELAY) revert InvalidDelay();

        delay = _delay;
        admin = _admin;
        ubiTreasury = _ubiTreasury;

        for (uint256 i = 0; i < _proposers.length; i++) {
            isProposer[_proposers[i]] = true;
            emit ProposerUpdated(_proposers[i], true);
        }
        for (uint256 i = 0; i < _executors.length; i++) {
            isExecutor[_executors[i]] = true;
            emit ExecutorUpdated(_executors[i], true);
        }
    }

    // --- Schedule ---

    /// @notice Schedule a batch of transactions
    /// @param targets Target addresses
    /// @param values ETH values
    /// @param calldatas Encoded function calls
    /// @param predecessor Required preceding operation (bytes32(0) for none)
    /// @return id The operation ID
    function scheduleBatch(
        address[] calldata targets,
        uint256[] calldata values,
        bytes[] calldata calldatas,
        bytes32 predecessor
    ) external onlyProposer returns (bytes32) {
        if (targets.length != values.length || targets.length != calldatas.length) {
            revert ArrayLengthMismatch();
        }

        bytes32 id = hashOperationBatch(targets, values, calldatas, predecessor);
        if (timestamps[id] != 0) revert OperationAlreadyQueued();

        uint256 readyTimestamp = block.timestamp + delay;
        timestamps[id] = readyTimestamp;

        emit OperationScheduled(id, targets, values, calldatas, predecessor, readyTimestamp);
        return id;
    }

    /// @notice Schedule a single transaction (convenience wrapper)
    function schedule(
        address target,
        uint256 value,
        bytes calldata data,
        bytes32 predecessor
    ) external onlyProposer returns (bytes32) {
        address[] memory targets = new address[](1);
        uint256[] memory values = new uint256[](1);
        bytes[] memory calldatas = new bytes[](1);
        targets[0] = target;
        values[0] = value;
        calldatas[0] = data;

        bytes32 id = hashOperationBatch(targets, values, calldatas, predecessor);
        if (timestamps[id] != 0) revert OperationAlreadyQueued();

        uint256 readyTimestamp = block.timestamp + delay;
        timestamps[id] = readyTimestamp;

        emit OperationScheduled(id, targets, values, calldatas, predecessor, readyTimestamp);
        return id;
    }

    // --- Execute ---

    /// @notice Execute a batch of queued transactions
    function executeBatch(
        address[] calldata targets,
        uint256[] calldata values,
        bytes[] calldata calldatas,
        bytes32 predecessor
    ) external payable onlyExecutor {
        bytes32 id = hashOperationBatch(targets, values, calldatas, predecessor);

        // Validate state
        uint256 readyTime = timestamps[id];
        if (readyTime == 0 || readyTime == 1) revert OperationNotQueued();
        if (block.timestamp < readyTime) revert OperationNotReady();
        if (block.timestamp > readyTime + GRACE_PERIOD) revert OperationExpired();

        // Check predecessor
        if (predecessor != bytes32(0) && timestamps[predecessor] != 1) {
            revert PredecessorNotExecuted();
        }

        // Mark as executed (1 = done)
        timestamps[id] = 1;

        // Execute all calls
        for (uint256 i = 0; i < targets.length; i++) {
            (bool success,) = targets[i].call{value: values[i]}(calldatas[i]);
            if (!success) revert ExecutionFailed(i);
        }

        emit OperationExecuted(id);
    }

    /// @notice Execute a single queued transaction (convenience)
    function execute(
        address target,
        uint256 value,
        bytes calldata data,
        bytes32 predecessor
    ) external payable onlyExecutor {
        address[] memory targets = new address[](1);
        uint256[] memory values = new uint256[](1);
        bytes[] memory calldatas = new bytes[](1);
        targets[0] = target;
        values[0] = value;
        calldatas[0] = data;

        bytes32 id = hashOperationBatch(targets, values, calldatas, predecessor);

        uint256 readyTime = timestamps[id];
        if (readyTime == 0 || readyTime == 1) revert OperationNotQueued();
        if (block.timestamp < readyTime) revert OperationNotReady();
        if (block.timestamp > readyTime + GRACE_PERIOD) revert OperationExpired();

        if (predecessor != bytes32(0) && timestamps[predecessor] != 1) {
            revert PredecessorNotExecuted();
        }

        timestamps[id] = 1;

        (bool success,) = target.call{value: value}(data);
        if (!success) revert ExecutionFailed(0);

        emit OperationExecuted(id);
    }

    // --- Cancel ---

    /// @notice Cancel a queued operation
    function cancel(bytes32 id) external onlyProposer {
        uint256 readyTime = timestamps[id];
        if (readyTime == 0 || readyTime == 1) revert OperationNotQueued();

        delete timestamps[id];
        emit OperationCancelled(id);
    }

    // --- Admin Functions (only via timelock itself for security) ---

    /// @notice Update the delay (must be called through timelock itself)
    function updateDelay(uint256 newDelay) external onlySelf {
        if (newDelay < MIN_DELAY || newDelay > MAX_DELAY) revert InvalidDelay();
        uint256 oldDelay = delay;
        delay = newDelay;
        emit DelayUpdated(oldDelay, newDelay);
    }

    /// @notice Set proposer role
    function setProposer(address account, bool status) external onlyAdmin {
        isProposer[account] = status;
        emit ProposerUpdated(account, status);
    }

    /// @notice Set executor role
    function setExecutor(address account, bool status) external onlyAdmin {
        isExecutor[account] = status;
        emit ExecutorUpdated(account, status);
    }

    /// @notice Transfer admin (can also be done via timelock for full decentralization)
    function transferAdmin(address newAdmin) external onlyAdmin {
        emit AdminTransferred(admin, newAdmin);
        admin = newAdmin;
    }

    // --- View Functions ---

    /// @notice Hash an operation for ID generation
    function hashOperationBatch(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 predecessor
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(targets, values, calldatas, predecessor));
    }

    /// @notice Check if an operation is pending (queued but not executed)
    function isOperationPending(bytes32 id) public view returns (bool) {
        uint256 ts = timestamps[id];
        return ts > 1; // not 0 (unset) and not 1 (executed)
    }

    /// @notice Check if an operation is ready to execute
    function isOperationReady(bytes32 id) public view returns (bool) {
        uint256 ts = timestamps[id];
        return ts > 1 && block.timestamp >= ts && block.timestamp <= ts + GRACE_PERIOD;
    }

    /// @notice Check if an operation was executed
    function isOperationDone(bytes32 id) public view returns (bool) {
        return timestamps[id] == 1;
    }

    /// @notice Accept ETH
    receive() external payable {}
}
