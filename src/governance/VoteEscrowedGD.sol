// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/interfaces/IERC20.sol";

/**
 * @title VoteEscrowedGD (veG$)
 * @notice Lock G$ to receive voting power. Longer lock = more power (Curve-style).
 * @dev Non-transferable governance token. Voting power decays linearly to unlock time.
 *
 *   votingPower = lockedAmount * timeRemaining / MAX_LOCK
 *
 * Locks range from 1 week to 4 years. Users can extend locks or increase amount.
 * 33% of early-unlock penalties flow to UBI pool.
 */
contract VoteEscrowedGD {
    // --- Types ---
    struct Lock {
        uint128 amount;      // G$ locked
        uint128 end;         // unlock timestamp
    }

    // --- Constants ---
    string  public constant name     = "Vote-Escrowed GoodDollar";
    string  public constant symbol   = "veG$";
    uint8   public constant decimals = 18;
    uint256 public constant MAX_LOCK = 4 * 365 days;  // 4 years
    uint256 public constant MIN_LOCK = 7 days;         // 1 week
    uint256 public constant EARLY_UNLOCK_PENALTY_BPS = 3000; // 30%
    uint256 public constant UBI_PENALTY_SHARE_BPS    = 3333; // 33% of penalty → UBI

    // --- State ---
    IERC20  public immutable gd;
    address public ubiTreasury;
    address public admin;

    mapping(address => Lock) public locks;
    uint256 public totalLocked;

    // Delegation
    mapping(address => address) public delegates;
    // Snapshot support: checkpoint-based voting power
    struct Checkpoint {
        uint48 timestamp;
        uint208 votes;
    }
    mapping(address => Checkpoint[]) internal _checkpoints;
    Checkpoint[] internal _totalSupplyCheckpoints;

    // --- Events ---
    event Locked(address indexed user, uint256 amount, uint256 unlockTime);
    event Extended(address indexed user, uint256 newUnlockTime);
    event Increased(address indexed user, uint256 addedAmount);
    event Withdrawn(address indexed user, uint256 amount);
    event EarlyUnlocked(address indexed user, uint256 received, uint256 penalty, uint256 toUBI);
    event DelegateChanged(address indexed delegator, address indexed fromDelegate, address indexed toDelegate);
    event UbiTreasuryUpdated(address indexed newTreasury);

    // --- Errors ---
    error LockTooShort();
    error LockTooLong();
    error LockNotExpired();
    error NoLock();
    error LockExpired();
    error ZeroAmount();
    error CannotShortenLock();
    error NotAdmin();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    constructor(address _gd, address _ubiTreasury, address _admin) {
        gd = IERC20(_gd);
        ubiTreasury = _ubiTreasury;
        admin = _admin;
    }

    // --- Core Functions ---

    /// @notice Lock G$ for voting power
    /// @param amount G$ to lock
    /// @param duration Lock duration in seconds
    function lock(uint256 amount, uint256 duration) external {
        if (amount == 0) revert ZeroAmount();
        if (duration < MIN_LOCK) revert LockTooShort();
        if (duration > MAX_LOCK) revert LockTooLong();
        if (locks[msg.sender].amount > 0) revert LockNotExpired(); // use increase/extend

        uint256 end = block.timestamp + duration;
        locks[msg.sender] = Lock(uint128(amount), uint128(end));
        totalLocked += amount;

        require(gd.transferFrom(msg.sender, address(this), amount), "transferFrom failed");

        address delegate = delegates[msg.sender];
        if (delegate == address(0)) {
            delegates[msg.sender] = msg.sender;
            delegate = msg.sender;
        }
        _writeCheckpoint(_checkpoints[delegate], _add, votingPowerOf(msg.sender));
        _writeCheckpoint(_totalSupplyCheckpoints, _add, votingPowerOf(msg.sender));

        emit Locked(msg.sender, amount, end);
    }

    /// @notice Increase locked amount (keeps same unlock time)
    function increaseLock(uint256 addedAmount) external {
        if (addedAmount == 0) revert ZeroAmount();
        Lock storage l = locks[msg.sender];
        if (l.amount == 0) revert NoLock();
        if (block.timestamp >= l.end) revert LockExpired();

        uint256 oldPower = votingPowerOf(msg.sender);
        l.amount += uint128(addedAmount);
        totalLocked += addedAmount;
        uint256 newPower = votingPowerOf(msg.sender);

        require(gd.transferFrom(msg.sender, address(this), addedAmount), "transferFrom failed");

        address delegate = delegates[msg.sender];
        _writeCheckpoint(_checkpoints[delegate], _add, newPower - oldPower);
        _writeCheckpoint(_totalSupplyCheckpoints, _add, newPower - oldPower);

        emit Increased(msg.sender, addedAmount);
    }

    /// @notice Extend lock duration
    function extendLock(uint256 newEnd) external {
        Lock storage l = locks[msg.sender];
        if (l.amount == 0) revert NoLock();
        if (newEnd <= l.end) revert CannotShortenLock();
        if (newEnd > block.timestamp + MAX_LOCK) revert LockTooLong();

        uint256 oldPower = votingPowerOf(msg.sender);
        l.end = uint128(newEnd);
        uint256 newPower = votingPowerOf(msg.sender);

        address delegate = delegates[msg.sender];
        if (newPower > oldPower) {
            _writeCheckpoint(_checkpoints[delegate], _add, newPower - oldPower);
            _writeCheckpoint(_totalSupplyCheckpoints, _add, newPower - oldPower);
        }

        emit Extended(msg.sender, newEnd);
    }

    /// @notice Withdraw after lock expires
    function withdraw() external {
        Lock storage l = locks[msg.sender];
        if (l.amount == 0) revert NoLock();
        if (block.timestamp < l.end) revert LockNotExpired();

        uint256 amount = l.amount;
        address delegate = delegates[msg.sender];

        // Power should be 0 at expiry, but clean up checkpoints
        _writeCheckpoint(_checkpoints[delegate], _sub, 0); // noop effectively

        delete locks[msg.sender];
        totalLocked -= amount;

        require(gd.transfer(msg.sender, amount), "transfer failed");
        emit Withdrawn(msg.sender, amount);
    }

    /// @notice Early unlock with penalty (30%). 33% of penalty goes to UBI.
    function earlyUnlock() external {
        Lock storage l = locks[msg.sender];
        if (l.amount == 0) revert NoLock();
        if (block.timestamp >= l.end) revert LockExpired(); // just use withdraw()

        uint256 amount = l.amount;
        uint256 penalty = (amount * EARLY_UNLOCK_PENALTY_BPS) / 10000;
        uint256 toUBI = (penalty * UBI_PENALTY_SHARE_BPS) / 10000;
        uint256 burned = penalty - toUBI;
        uint256 received = amount - penalty;

        // Remove voting power
        uint256 power = votingPowerOf(msg.sender);
        address delegate = delegates[msg.sender];
        if (power > 0) {
            _writeCheckpoint(_checkpoints[delegate], _sub, power);
            _writeCheckpoint(_totalSupplyCheckpoints, _sub, power);
        }

        delete locks[msg.sender];
        totalLocked -= amount;

        require(gd.transfer(msg.sender, received), "transfer failed");
        if (toUBI > 0) require(gd.transfer(ubiTreasury, toUBI), "UBI transfer failed");
        // burned portion stays in contract (effectively burned from circulation)

        emit EarlyUnlocked(msg.sender, received, penalty, toUBI);
    }

    // --- View Functions ---

    /// @notice Current voting power of an account (decays linearly)
    function votingPowerOf(address account) public view returns (uint256) {
        Lock memory l = locks[account];
        if (l.amount == 0 || block.timestamp >= l.end) return 0;
        uint256 remaining = l.end - block.timestamp;
        return (uint256(l.amount) * remaining) / MAX_LOCK;
    }

    /// @notice Get delegated voting power (sum of all delegators' power)
    function getVotes(address account) external view returns (uint256) {
        Checkpoint[] storage ckpts = _checkpoints[account];
        if (ckpts.length == 0) return 0;
        return ckpts[ckpts.length - 1].votes;
    }

    /// @notice Get voting power at a past timestamp
    function getPastVotes(address account, uint256 timestamp) external view returns (uint256) {
        return _checkpointLookup(_checkpoints[account], timestamp);
    }

    /// @notice Total voting power supply
    function totalVotingPower() external view returns (uint256) {
        Checkpoint[] storage ckpts = _totalSupplyCheckpoints;
        if (ckpts.length == 0) return 0;
        return ckpts[ckpts.length - 1].votes;
    }

    /// @notice Delegate votes to another address
    function delegate(address delegatee) external {
        address oldDelegate = delegates[msg.sender];
        delegates[msg.sender] = delegatee;

        uint256 power = votingPowerOf(msg.sender);
        if (power > 0) {
            if (oldDelegate != address(0)) {
                _writeCheckpoint(_checkpoints[oldDelegate], _sub, power);
            }
            _writeCheckpoint(_checkpoints[delegatee], _add, power);
        }

        emit DelegateChanged(msg.sender, oldDelegate, delegatee);
    }

    function setUbiTreasury(address _ubiTreasury) external onlyAdmin {
        ubiTreasury = _ubiTreasury;
        emit UbiTreasuryUpdated(_ubiTreasury);
    }

    // --- Internal Checkpoint Logic ---

    function _writeCheckpoint(
        Checkpoint[] storage ckpts,
        function(uint256, uint256) view returns (uint256) op,
        uint256 delta
    ) internal {
        uint256 len = ckpts.length;
        uint256 oldValue = len > 0 ? ckpts[len - 1].votes : 0;
        uint256 newValue = op(oldValue, delta);

        if (len > 0 && ckpts[len - 1].timestamp == uint48(block.timestamp)) {
            ckpts[len - 1].votes = uint208(newValue);
        } else {
            ckpts.push(Checkpoint(uint48(block.timestamp), uint208(newValue)));
        }
    }

    function _checkpointLookup(Checkpoint[] storage ckpts, uint256 timestamp) internal view returns (uint256) {
        uint256 len = ckpts.length;
        if (len == 0) return 0;
        if (ckpts[len - 1].timestamp <= timestamp) return ckpts[len - 1].votes;
        if (ckpts[0].timestamp > timestamp) return 0;

        uint256 lo = 0;
        uint256 hi = len;
        while (lo < hi) {
            uint256 mid = (lo + hi) / 2;
            if (ckpts[mid].timestamp <= timestamp) {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }
        return ckpts[lo - 1].votes;
    }

    function _add(uint256 a, uint256 b) internal pure returns (uint256) { return a + b; }
    function _sub(uint256 a, uint256 b) internal pure returns (uint256) { return a > b ? a - b : 0; }
}
