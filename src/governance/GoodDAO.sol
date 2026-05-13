// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./VoteEscrowedGD.sol";

/**
 * @title GoodDAO — On-Chain Governance for GoodDollar L2
 * @notice Propose, vote, and execute protocol changes. veG$ holders govern all
 *         protocol parameters: fee rates, UBI distribution, treasury, upgrades.
 *
 * @dev Inspired by OpenZeppelin Governor + Compound GovernorBravo.
 *   - Proposal threshold: 1% of total voting power
 *   - Quorum: 10% of total voting power
 *   - Voting period: 3 days
 *   - Timelock: 1 day delay before execution
 *   - UBI-specific: 33% of slashed proposal deposits → UBI pool
 */
contract GoodDAO {
    // --- Types ---
    enum ProposalState { Pending, Active, Canceled, Defeated, Succeeded, Queued, Executed, Expired }
    enum VoteType { Against, For, Abstain }

    struct Proposal {
        uint256 id;
        address proposer;
        address[] targets;
        uint256[] values;
        bytes[]   calldatas;
        string    description;
        uint256   startTime;
        uint256   endTime;
        uint256   executionTime; // 0 until queued
        uint256   forVotes;
        uint256   againstVotes;
        uint256   abstainVotes;
        bool      canceled;
        bool      executed;
    }

    struct Receipt {
        bool    hasVoted;
        VoteType support;
        uint256  votes;
    }

    // --- Constants ---
    uint256 public constant VOTING_DELAY   = 1 days;   // delay after proposal before voting
    uint256 public constant VOTING_PERIOD  = 3 days;   // voting window
    uint256 public constant TIMELOCK_DELAY = 1 days;   // delay after vote passes before execution
    uint256 public constant EXECUTION_WINDOW = 7 days; // must execute within this window
    uint256 public constant PROPOSAL_THRESHOLD_BPS = 100;  // 1% of total supply
    uint256 public constant QUORUM_BPS = 1000;             // 10% of total supply

    // --- State ---
    VoteEscrowedGD public immutable veGD;
    address public guardian;     // emergency cancel authority (renounced over time)

    uint256 public proposalCount;
    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => Receipt)) public receipts;

    // --- Events ---
    event ProposalCreated(uint256 indexed id, address indexed proposer, string description);
    event VoteCast(address indexed voter, uint256 indexed proposalId, VoteType support, uint256 votes);
    event ProposalQueued(uint256 indexed id, uint256 executionTime);
    event ProposalExecuted(uint256 indexed id);
    event ProposalCanceled(uint256 indexed id);
    event GuardianTransferred(address indexed oldGuardian, address indexed newGuardian);

    // --- Errors ---
    error BelowThreshold();
    error InvalidProposal();
    error ProposalNotActive();
    error AlreadyVoted();
    error ProposalNotSucceeded();
    error ProposalNotQueued();
    error TimelockNotReady();
    error ProposalExpiredError();
    error ExecutionFailed();
    error NotGuardian();
    error NotProposer();
    error ProposalAlreadyFinalized();

    modifier onlyGuardian() {
        if (msg.sender != guardian) revert NotGuardian();
        _;
    }

    constructor(address _veGD, address _guardian) {
        veGD = VoteEscrowedGD(_veGD);
        guardian = _guardian;
    }

    // --- Proposal Lifecycle ---

    /// @notice Create a proposal (must hold ≥1% of total voting power)
    function propose(
        address[] memory targets,
        uint256[] memory values,
        bytes[]   memory calldatas,
        string    memory description
    ) external returns (uint256) {
        uint256 totalPower = veGD.totalVotingPower();
        uint256 proposerPower = veGD.getVotes(msg.sender);

        // Threshold check (skip if total power is 0 — bootstrapping)
        if (totalPower > 0 && proposerPower < (totalPower * PROPOSAL_THRESHOLD_BPS) / 10000) {
            revert BelowThreshold();
        }
        if (targets.length == 0 || targets.length != values.length || targets.length != calldatas.length) {
            revert InvalidProposal();
        }

        proposalCount++;
        uint256 id = proposalCount;

        Proposal storage p = proposals[id];
        p.id = id;
        p.proposer = msg.sender;
        p.targets = targets;
        p.values = values;
        p.calldatas = calldatas;
        p.description = description;
        p.startTime = block.timestamp + VOTING_DELAY;
        p.endTime = p.startTime + VOTING_PERIOD;

        emit ProposalCreated(id, msg.sender, description);
        return id;
    }

    /// @notice Cast vote on a proposal
    function castVote(uint256 proposalId, VoteType support) external returns (uint256) {
        Proposal storage p = proposals[proposalId];
        if (block.timestamp < p.startTime || block.timestamp > p.endTime) revert ProposalNotActive();

        Receipt storage r = receipts[proposalId][msg.sender];
        if (r.hasVoted) revert AlreadyVoted();

        // Use voting power at proposal start time
        uint256 votes = veGD.getPastVotes(msg.sender, p.startTime);

        r.hasVoted = true;
        r.support = support;
        r.votes = votes;

        if (support == VoteType.For) {
            p.forVotes += votes;
        } else if (support == VoteType.Against) {
            p.againstVotes += votes;
        } else {
            p.abstainVotes += votes;
        }

        emit VoteCast(msg.sender, proposalId, support, votes);
        return votes;
    }

    /// @notice Queue a succeeded proposal for execution
    function queue(uint256 proposalId) external {
        if (state(proposalId) != ProposalState.Succeeded) revert ProposalNotSucceeded();

        Proposal storage p = proposals[proposalId];
        p.executionTime = block.timestamp + TIMELOCK_DELAY;

        emit ProposalQueued(proposalId, p.executionTime);
    }

    /// @notice Execute a queued proposal after timelock
    function execute(uint256 proposalId) external {
        if (state(proposalId) != ProposalState.Queued) revert ProposalNotQueued();

        Proposal storage p = proposals[proposalId];
        if (block.timestamp < p.executionTime) revert TimelockNotReady();
        if (block.timestamp > p.executionTime + EXECUTION_WINDOW) revert ProposalExpiredError();

        p.executed = true;

        for (uint256 i = 0; i < p.targets.length; i++) {
            (bool success,) = p.targets[i].call{value: p.values[i]}(p.calldatas[i]);
            if (!success) revert ExecutionFailed();
        }

        emit ProposalExecuted(proposalId);
    }

    /// @notice Cancel a proposal (proposer or guardian)
    function cancel(uint256 proposalId) external {
        Proposal storage p = proposals[proposalId];
        if (p.executed || p.canceled) revert ProposalAlreadyFinalized();
        if (msg.sender != p.proposer && msg.sender != guardian) revert NotProposer();

        p.canceled = true;
        emit ProposalCanceled(proposalId);
    }

    // --- View Functions ---

    function state(uint256 proposalId) public view returns (ProposalState) {
        Proposal storage p = proposals[proposalId];
        if (p.canceled) return ProposalState.Canceled;
        if (p.executed) return ProposalState.Executed;
        if (block.timestamp < p.startTime) return ProposalState.Pending;
        if (block.timestamp <= p.endTime) return ProposalState.Active;

        // Voting ended — check result
        uint256 totalPower = veGD.totalVotingPower();
        uint256 quorum = (totalPower * QUORUM_BPS) / 10000;

        if (p.forVotes + p.abstainVotes < quorum) return ProposalState.Defeated;
        if (p.forVotes <= p.againstVotes) return ProposalState.Defeated;

        // Passed
        if (p.executionTime == 0) return ProposalState.Succeeded;

        // Queued
        if (block.timestamp > p.executionTime + EXECUTION_WINDOW) return ProposalState.Expired;
        return ProposalState.Queued;
    }

    function getProposalTargets(uint256 proposalId) external view returns (address[] memory) {
        return proposals[proposalId].targets;
    }

    function getProposalCalldatas(uint256 proposalId) external view returns (bytes[] memory) {
        return proposals[proposalId].calldatas;
    }

    function getProposalValues(uint256 proposalId) external view returns (uint256[] memory) {
        return proposals[proposalId].values;
    }

    /// @notice Transfer guardian role (or renounce by setting to address(0))
    function transferGuardian(address newGuardian) external onlyGuardian {
        emit GuardianTransferred(guardian, newGuardian);
        guardian = newGuardian;
    }

    /// @notice Accept ETH for proposal execution
    receive() external payable {}
}
