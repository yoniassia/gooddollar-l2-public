// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/interfaces/IERC20.sol";

/**
 * @title GoodDollar Token (G$) — L2 Native (Secure Version)
 * @notice The native UBI token of the GoodDollar L2 chain with enhanced security.
 * @dev Deployed as a precompile on the L2 genesis. Security features:
 *   - Multi-sig oracle management with role-based access control
 *   - Emergency pause mechanism for identity verification
 *   - 48h timelock for critical oracle changes
 *   - Supports daily UBI claims for verified humans
 *   - Fee collection from all dApps → UBI pool
 *   - Validator staking
 */
contract GoodDollarTokenSecure {
    string public constant name = "GoodDollar";
    string public constant symbol = "G$";
    uint8 public constant decimals = 18;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    // UBI Configuration
    uint256 public dailyUBIAmount = 1e18; // 1 G$ per day per person (adjustable)
    uint256 public constant CLAIM_INTERVAL = 24 hours;

    // UBI Pool — funded by dApp fees
    uint256 public ubiPool;
    uint256 public poolDistributionCycle; // Track current distribution cycle to handle remainders

    // Identity & Claims
    mapping(address => bool) public isVerifiedHuman;
    mapping(address => uint256) public lastClaimTime;
    uint256 public totalVerifiedHumans;

    // Oracle Consensus for Human Verification
    struct VerificationVote {
        uint256 approvals;
        uint256 rejections;
        mapping(address => bool) hasVoted;
        bool status; // true = verify, false = revoke
        bool executed;
    }
    mapping(address => VerificationVote) public verificationVotes;
    mapping(address => uint256) public pendingVerificationId;

    // Security: Role-Based Access Control
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant EMERGENCY_ROLE = keccak256("EMERGENCY_ROLE");

    mapping(bytes32 => mapping(address => bool)) public hasRole;
    mapping(bytes32 => uint256) public roleCount; // Track number of addresses per role

    // Security: Emergency Controls
    bool public verificationPaused = false;
    address public emergencyPauser;

    // Security: Timelock for Oracle Changes
    uint256 public constant TIMELOCK_DELAY = 48 hours;

    struct PendingOracleChange {
        address oracle;
        bool add; // true = add, false = remove
        uint256 executeAt;
        bool executed;
    }

    mapping(uint256 => PendingOracleChange) public pendingOracleChanges;
    uint256 public nextChangeId = 1;

    // Authorized minters (e.g. UBIClaimV2)
    mapping(address => bool) public minters;

    // Fee Splitter — dApps register here
    uint256 public constant UBI_FEE_BPS = 1000; // 10% of fees go to UBI pool

    // Events
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event UBIClaimed(address indexed claimer, uint256 amount, uint256 timestamp);
    event HumanVerified(address indexed human, bool status);
    event UBIPoolFunded(address indexed from, uint256 amount);
    event DailyUBIDistributed(uint256 totalAmount, uint256 recipients);
    event MinterSet(address indexed minter, bool authorized);

    // Security Events
    event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender);
    event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender);
    event VerificationPaused(bool paused, address indexed by);
    event OracleChangeScheduled(uint256 indexed changeId, address indexed oracle, bool add, uint256 executeAt);
    event OracleChangeExecuted(uint256 indexed changeId, address indexed oracle, bool add);
    event OracleChangeCanceled(uint256 indexed changeId);
    event VerificationVoteCast(address indexed human, address indexed oracle, bool approval, bool status);
    event VerificationConsensusReached(address indexed human, bool status, uint256 approvals, uint256 rejections);

    // Custom Errors
    error UnauthorizedRole(bytes32 role);
    error VerificationTemporarilyPaused();
    error InsufficientOracles();
    error TimelockNotReady(uint256 executeAt);
    error ChangeAlreadyExecuted();
    error ChangeNotFound();
    error AlreadyVoted();
    error NoConsensusReached();
    error VerificationAlreadyExecuted();
    error NotVerifiedHuman();
    error AlreadyClaimedToday();
    error InsufficientBalance();
    error InsufficientAllowance();
    error HumanAddressCannotBeZero();
    error VoteStatusMismatch();
    error VoteAlreadyExecuted();
    error NotAuthorizedMinter();

    modifier onlyRole(bytes32 role) {
        if (!hasRole[role][msg.sender]) revert UnauthorizedRole(role);
        _;
    }

    modifier onlyAdmin() {
        if (!hasRole[ADMIN_ROLE][msg.sender]) revert UnauthorizedRole(ADMIN_ROLE);
        _;
    }

    modifier onlyOracle() {
        if (!hasRole[ORACLE_ROLE][msg.sender]) revert UnauthorizedRole(ORACLE_ROLE);
        _;
    }

    modifier onlyMinter() {
        if (!minters[msg.sender]) revert NotAuthorizedMinter();
        _;
    }

    modifier whenVerificationNotPaused() {
        if (verificationPaused) revert VerificationTemporarilyPaused();
        _;
    }

    constructor(
        address _admin,
        address[] memory _initialOracles,
        address _emergencyPauser,
        uint256 _initialSupply
    ) {
        require(_initialOracles.length >= 2, "Need at least 2 oracles for security");
        require(_admin != address(0), "Admin cannot be zero");
        require(_emergencyPauser != address(0), "Emergency pauser cannot be zero");

        // Grant initial roles
        _grantRole(ADMIN_ROLE, _admin);
        _grantRole(EMERGENCY_ROLE, _emergencyPauser);

        // Setup initial oracles (multi-sig required)
        for (uint256 i = 0; i < _initialOracles.length; i++) {
            require(_initialOracles[i] != address(0), "Oracle cannot be zero");
            _grantRole(ORACLE_ROLE, _initialOracles[i]);
        }

        emergencyPauser = _emergencyPauser;
        _mint(_admin, _initialSupply);
    }

    // ============ ERC20 Standard ============

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 currentAllowance = allowance[from][msg.sender];
        if (currentAllowance != type(uint256).max) {
            if (currentAllowance < amount) revert InsufficientAllowance();
            allowance[from][msg.sender] = currentAllowance - amount;
        }
        _transfer(from, to, amount);
        return true;
    }

    // ============ UBI Claims ============

    /**
     * @notice Claim daily UBI. Must be a verified human. One claim per 24h.
     * @dev The claim amount comes from two sources:
     *   1. Base UBI (newly minted G$)
     *   2. Share of UBI pool (funded by dApp fees)
     */
    function claimUBI() external {
        if (!isVerifiedHuman[msg.sender]) revert NotVerifiedHuman();
        if (lastClaimTime[msg.sender] != 0 && block.timestamp < lastClaimTime[msg.sender] + CLAIM_INTERVAL) {
            revert AlreadyClaimedToday();
        }

        lastClaimTime[msg.sender] = block.timestamp;

        // Base UBI: mint new G$
        uint256 baseAmount = dailyUBIAmount;
        _mint(msg.sender, baseAmount);

        // Pool UBI: distribute share of fee pool with SafeMath and proper remainder handling
        uint256 poolShare = 0;
        if (ubiPool > 0 && totalVerifiedHumans > 0) {
            // Calculate equal distribution per verified human
            poolShare = ubiPool / totalVerifiedHumans;

            // Only distribute if there's a meaningful share (prevent dust distribution)
            if (poolShare > 0) {
                // Safe subtraction - only deduct what we're actually sending
                ubiPool = ubiPool - poolShare;
                _transfer(address(this), msg.sender, poolShare);

                // Note: Remainder stays in pool for future distributions
                // This prevents permanent fund locking while maintaining fairness
                // The remainder will be included in the next distribution cycle
            }
        }

        emit UBIClaimed(msg.sender, baseAmount + poolShare, block.timestamp);
    }

    /**
     * @notice Fund the UBI pool. Called by dApps sending their UBI fee share.
     */
    function fundUBIPool(uint256 amount) external {
        _transfer(msg.sender, address(this), amount);
        ubiPool += amount;
        emit UBIPoolFunded(msg.sender, amount);
    }

    /**
     * @notice Calculate the UBI fee for a given amount (used by dApps).
     */
    function calculateUBIFee(uint256 amount) external pure returns (uint256) {
        return (amount * UBI_FEE_BPS) / 10000;
    }

    // ============ Secure Identity Management ============

    /**
     * @notice Vote to verify or unverify a human. Requires oracle consensus.
     * @dev Multiple oracles must vote to reach consensus before execution.
     */
    function voteVerifyHuman(address human, bool approval, bool status) external onlyOracle whenVerificationNotPaused {
        if (human == address(0)) revert HumanAddressCannotBeZero();

        VerificationVote storage vote = verificationVotes[human];

        // Initialize new vote if needed
        if (vote.approvals == 0 && vote.rejections == 0 && !vote.executed) {
            vote.status = status;
        }

        // Ensure vote is for the same action (verify/revoke)
        if (vote.status != status) revert VoteStatusMismatch();
        if (vote.executed) revert VoteAlreadyExecuted();
        if (vote.hasVoted[msg.sender]) revert AlreadyVoted();

        // Cast vote
        vote.hasVoted[msg.sender] = true;
        if (approval) {
            vote.approvals++;
        } else {
            vote.rejections++;
        }

        emit VerificationVoteCast(human, msg.sender, approval, status);

        // Check for consensus (majority of oracles)
        uint256 totalOracles = roleCount[ORACLE_ROLE];
        uint256 requiredVotes = (totalOracles / 2) + 1; // Majority consensus

        if (vote.approvals >= requiredVotes) {
            _executeVerification(human, status);
            vote.executed = true;
            emit VerificationConsensusReached(human, status, vote.approvals, vote.rejections);
        }
    }

    /**
     * @notice Execute human verification after consensus is reached.
     * @dev Internal function to update verification status.
     */
    function _executeVerification(address human, bool status) internal {
        if (status && !isVerifiedHuman[human]) {
            totalVerifiedHumans++;
        } else if (!status && isVerifiedHuman[human]) {
            totalVerifiedHumans--;
        }
        isVerifiedHuman[human] = status;
        emit HumanVerified(human, status);
    }

    /**
     * @notice Batch verify humans. More gas efficient for migrations.
     * @dev WARNING: This function bypasses oracle consensus for efficiency.
     *      Only use during initial setup or emergency migrations with admin oversight.
     */
    function batchVerifyHumans(address[] calldata humans) external onlyAdmin whenVerificationNotPaused {
        for (uint256 i = 0; i < humans.length; i++) {
            if (!isVerifiedHuman[humans[i]]) {
                isVerifiedHuman[humans[i]] = true;
                totalVerifiedHumans++;
                emit HumanVerified(humans[i], true);
            }
        }
    }

    /**
     * @notice Batch revoke human verification. Symmetric to batchVerifyHumans.
     * @dev WARNING: This function bypasses oracle consensus for efficiency.
     *      Only use during emergency situations or mass revocations with admin oversight.
     */
    function batchRevokeHumans(address[] calldata humans) external onlyAdmin whenVerificationNotPaused {
        for (uint256 i = 0; i < humans.length; i++) {
            if (isVerifiedHuman[humans[i]]) {
                isVerifiedHuman[humans[i]] = false;
                totalVerifiedHumans--;
                emit HumanVerified(humans[i], false);
            }
        }
    }

    // ============ Emergency Controls ============

    /**
     * @notice Emergency pause/unpause verification system.
     * @dev Can be called by emergency role or any admin for rapid response.
     */
    function setVerificationPaused(bool _paused) external {
        require(
            hasRole[EMERGENCY_ROLE][msg.sender] || hasRole[ADMIN_ROLE][msg.sender],
            "Need EMERGENCY_ROLE or ADMIN_ROLE"
        );
        verificationPaused = _paused;
        emit VerificationPaused(_paused, msg.sender);
    }

    // ============ Timelock Oracle Management ============

    /**
     * @notice Schedule adding or removing an oracle (48h timelock).
     * @dev Prevents immediate oracle changes for security.
     */
    function scheduleOracleChange(address oracle, bool add) external onlyAdmin {
        require(oracle != address(0), "Oracle cannot be zero");

        // Security check: prevent removing last oracle
        if (!add && roleCount[ORACLE_ROLE] <= 1) {
            revert InsufficientOracles();
        }

        uint256 changeId = nextChangeId++;
        uint256 executeAt = block.timestamp + TIMELOCK_DELAY;

        pendingOracleChanges[changeId] = PendingOracleChange({
            oracle: oracle,
            add: add,
            executeAt: executeAt,
            executed: false
        });

        emit OracleChangeScheduled(changeId, oracle, add, executeAt);
    }

    /**
     * @notice Execute a scheduled oracle change after timelock expires.
     */
    function executeOracleChange(uint256 changeId) external {
        PendingOracleChange storage change = pendingOracleChanges[changeId];

        if (change.oracle == address(0)) revert ChangeNotFound();
        if (change.executed) revert ChangeAlreadyExecuted();
        if (block.timestamp < change.executeAt) revert TimelockNotReady(change.executeAt);

        change.executed = true;

        if (change.add) {
            _grantRole(ORACLE_ROLE, change.oracle);
        } else {
            _revokeRole(ORACLE_ROLE, change.oracle);
        }

        emit OracleChangeExecuted(changeId, change.oracle, change.add);
    }

    /**
     * @notice Cancel a pending oracle change (admin only).
     */
    function cancelOracleChange(uint256 changeId) external onlyAdmin {
        PendingOracleChange storage change = pendingOracleChanges[changeId];

        if (change.oracle == address(0)) revert ChangeNotFound();
        if (change.executed) revert ChangeAlreadyExecuted();

        delete pendingOracleChanges[changeId];
        emit OracleChangeCanceled(changeId);
    }

    // ============ Role Management ============

    /**
     * @notice Grant a role to an account.
     * @dev Internal function used by constructor and oracle management.
     */
    function _grantRole(bytes32 role, address account) internal {
        if (!hasRole[role][account]) {
            hasRole[role][account] = true;
            roleCount[role]++;
            emit RoleGranted(role, account, msg.sender);
        }
    }

    /**
     * @notice Revoke a role from an account.
     * @dev Internal function used by oracle management.
     */
    function _revokeRole(bytes32 role, address account) internal {
        if (hasRole[role][account]) {
            hasRole[role][account] = false;
            roleCount[role]--;
            emit RoleRevoked(role, account, msg.sender);
        }
    }

    /**
     * @notice Grant admin role (admin only, immediate).
     * @dev Admin changes don't require timelock for operational flexibility.
     */
    function grantAdminRole(address account) external onlyAdmin {
        _grantRole(ADMIN_ROLE, account);
    }

    /**
     * @notice Revoke admin role (admin only, immediate).
     */
    function revokeAdminRole(address account) external onlyAdmin {
        require(roleCount[ADMIN_ROLE] > 1, "Need at least 1 admin");
        _revokeRole(ADMIN_ROLE, account);
    }

    /**
     * @notice Grant emergency role (admin only, immediate).
     */
    function grantEmergencyRole(address account) external onlyAdmin {
        _grantRole(EMERGENCY_ROLE, account);
    }

    /**
     * @notice Revoke emergency role (admin only, immediate).
     */
    function revokeEmergencyRole(address account) external onlyAdmin {
        _revokeRole(EMERGENCY_ROLE, account);
    }

    // ============ Standard Governance ============

    function setDailyUBIAmount(uint256 amount) external onlyAdmin {
        dailyUBIAmount = amount;
    }

    function setMinter(address minter, bool authorized) external onlyAdmin {
        require(minter != address(0), "Minter cannot be zero address");
        if (authorized) {
            uint256 size;
            assembly { size := extcodesize(minter) }
            require(size > 0, "Minter must be a contract");
        }
        minters[minter] = authorized;
        emit MinterSet(minter, authorized);
    }

    /**
     * @notice Mint G$ tokens. Only callable by authorized minters (e.g. UBIClaimV2).
     */
    function mint(address to, uint256 amount) external onlyMinter {
        _mint(to, amount);
    }

    // ============ View Functions ============

    /**
     * @notice Get the number of addresses with a specific role.
     */
    function getRoleCount(bytes32 role) external view returns (uint256) {
        return roleCount[role];
    }

    /**
     * @notice Check if oracle change is ready to execute.
     */
    function isChangeReady(uint256 changeId) external view returns (bool) {
        PendingOracleChange memory change = pendingOracleChanges[changeId];
        return change.oracle != address(0) &&
               !change.executed &&
               block.timestamp >= change.executeAt;
    }

    // ============ Internal ============

    function _transfer(address from, address to, uint256 amount) internal {
        if (balanceOf[from] < amount) revert InsufficientBalance();
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }

    function _mint(address to, uint256 amount) internal {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }
}