// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title OptimisticResolver
 * @notice Optimistic oracle resolution for GoodPredict markets.
 *
 *         Inspired by UMA's Optimistic Oracle design:
 *           1. Anyone can propose a resolution outcome (YES/NO) with a G$ bond
 *           2. 24-hour dispute period — anyone can dispute by posting a counter-bond
 *           3. If no dispute: proposal auto-finalizes after the dispute window
 *           4. If disputed: escalates to admin committee for final resolution
 *           5. Loser forfeits their bond (split: 50% to winner, 50% to UBI)
 *
 *         This replaces admin-only resolution with a permissionless system.
 *
 *         Integration: MarketFactory calls `requestResolution()` when market ends,
 *         then checks `getResolution()` to get the final outcome.
 */

interface IResolutionToken {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface IMarketFactory {
    function resolve(uint256 marketId, bool yesWon) external;
}

interface IUBIFeeSplitterResolver {
    function splitFee(uint256 totalFee, address dAppRecipient)
        external
        returns (uint256, uint256, uint256);
}

contract OptimisticResolver {

    // ============ Types ============

    enum ResolutionStatus {
        None,           // No resolution requested
        Proposed,       // Outcome proposed, in dispute window
        Disputed,       // Disputed, awaiting admin decision
        Finalized       // Resolved, outcome is final
    }

    struct Resolution {
        uint256 marketId;
        bool proposedOutcome;       // true = YES, false = NO
        address proposer;
        uint256 proposerBond;
        uint256 proposalTime;

        bool isDisputed;
        address disputer;
        uint256 disputerBond;
        uint256 disputeTime;

        ResolutionStatus status;
        bool finalOutcome;          // only valid when status == Finalized
        uint256 finalizedTime;
    }

    // ============ State ============

    IResolutionToken public immutable bondToken;    // G$ used for bonds
    IMarketFactory public immutable marketFactory;
    address public immutable feeSplitter;
    address public admin;
    address[] public committee;                     // dispute resolution committee

    uint256 public bondAmount = 1000e18;            // 1,000 G$ default bond
    uint256 public disputeWindow = 24 hours;        // dispute period

    // marketId → Resolution
    mapping(uint256 => Resolution) public resolutions;

    // Track if resolution was requested for a market
    mapping(uint256 => bool) public resolutionRequested;

    // ============ Events ============

    event ResolutionProposed(
        uint256 indexed marketId,
        address indexed proposer,
        bool proposedOutcome,
        uint256 bond,
        uint256 disputeDeadline
    );

    event ResolutionDisputed(
        uint256 indexed marketId,
        address indexed disputer,
        uint256 bond
    );

    event ResolutionFinalized(
        uint256 indexed marketId,
        bool outcome,
        bool wasDisputed
    );

    event BondSlashed(
        uint256 indexed marketId,
        address loser,
        address winner,
        uint256 winnerShare,
        uint256 ubiShare
    );

    event BondAmountUpdated(uint256 oldAmount, uint256 newAmount);
    event DisputeWindowUpdated(uint256 oldWindow, uint256 newWindow);

    // ============ Errors ============

    error NotAdmin();
    error NotMarketFactory();
    error ZeroAddress();
    error AlreadyProposed(uint256 marketId);
    error NotProposed(uint256 marketId);
    error AlreadyDisputed(uint256 marketId);
    error AlreadyFinalized(uint256 marketId);
    error DisputeWindowOpen(uint256 marketId, uint256 remaining);
    error DisputeWindowClosed(uint256 marketId);
    error TransferFailed();
    error NotResolutionRequested(uint256 marketId);
    error CannotDisputeOwnProposal();

    // ============ Modifiers ============

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    modifier onlyMarketFactoryOrAdmin() {
        if (msg.sender != address(marketFactory) && msg.sender != admin) revert NotMarketFactory();
        _;
    }

    // ============ Constructor ============

    constructor(
        address _bondToken,
        address _marketFactory,
        address _feeSplitter,
        address _admin
    ) {
        if (_bondToken == address(0)) revert ZeroAddress();
        if (_marketFactory == address(0)) revert ZeroAddress();
        if (_feeSplitter == address(0)) revert ZeroAddress();
        if (_admin == address(0)) revert ZeroAddress();

        bondToken = IResolutionToken(_bondToken);
        marketFactory = IMarketFactory(_marketFactory);
        feeSplitter = _feeSplitter;
        admin = _admin;
    }

    // ============ Admin ============

    function setAdmin(address _admin) external onlyAdmin {
        if (_admin == address(0)) revert ZeroAddress();
        admin = _admin;
    }

    function setBondAmount(uint256 _bondAmount) external onlyAdmin {
        emit BondAmountUpdated(bondAmount, _bondAmount);
        bondAmount = _bondAmount;
    }

    function setDisputeWindow(uint256 _disputeWindow) external onlyAdmin {
        emit DisputeWindowUpdated(disputeWindow, _disputeWindow);
        disputeWindow = _disputeWindow;
    }

    function setCommittee(address[] calldata _committee) external onlyAdmin {
        committee = _committee;
    }

    // ============ Resolution Flow ============

    /**
     * @notice Mark a market as needing resolution. Only callable by MarketFactory or admin.
     * @dev MarketFactory calls this after confirming the market end time has passed.
     *      Admin access is preserved for emergency use only.
     */
    function requestResolution(uint256 marketId) external onlyMarketFactoryOrAdmin {
        resolutionRequested[marketId] = true;
    }

    /**
     * @notice Propose an outcome for a market.
     *         Caller must approve bondAmount of G$ beforehand.
     * @param marketId The market to resolve
     * @param yesWon true if proposing YES outcome, false for NO
     */
    function proposeResolution(uint256 marketId, bool yesWon) external {
        if (!resolutionRequested[marketId]) revert NotResolutionRequested(marketId);
        if (resolutions[marketId].status != ResolutionStatus.None) {
            revert AlreadyProposed(marketId);
        }

        // Take bond
        bool ok = bondToken.transferFrom(msg.sender, address(this), bondAmount);
        if (!ok) revert TransferFailed();

        resolutions[marketId] = Resolution({
            marketId: marketId,
            proposedOutcome: yesWon,
            proposer: msg.sender,
            proposerBond: bondAmount,
            proposalTime: block.timestamp,
            isDisputed: false,
            disputer: address(0),
            disputerBond: 0,
            disputeTime: 0,
            status: ResolutionStatus.Proposed,
            finalOutcome: false,
            finalizedTime: 0
        });

        emit ResolutionProposed(
            marketId,
            msg.sender,
            yesWon,
            bondAmount,
            block.timestamp + disputeWindow
        );
    }

    /**
     * @notice Dispute a proposed resolution.
     *         Caller must approve bondAmount of G$ beforehand.
     * @param marketId The market whose resolution to dispute
     */
    function disputeResolution(uint256 marketId) external {
        Resolution storage r = resolutions[marketId];
        if (r.status != ResolutionStatus.Proposed) revert NotProposed(marketId);
        if (r.isDisputed) revert AlreadyDisputed(marketId);
        if (block.timestamp > r.proposalTime + disputeWindow) {
            revert DisputeWindowClosed(marketId);
        }
        if (msg.sender == r.proposer) revert CannotDisputeOwnProposal();

        // Take disputer bond — match proposer's bond to prevent asymmetry if admin changed bondAmount
        uint256 requiredBond = r.proposerBond;
        bool ok = bondToken.transferFrom(msg.sender, address(this), requiredBond);
        if (!ok) revert TransferFailed();

        r.isDisputed = true;
        r.disputer = msg.sender;
        r.disputerBond = requiredBond;
        r.disputeTime = block.timestamp;
        r.status = ResolutionStatus.Disputed;

        emit ResolutionDisputed(marketId, msg.sender, requiredBond);
    }

    /**
     * @notice Finalize an undisputed resolution after the dispute window.
     *         Anyone can call this — it's permissionless.
     */
    function finalizeResolution(uint256 marketId) external {
        Resolution storage r = resolutions[marketId];
        if (r.status != ResolutionStatus.Proposed) revert NotProposed(marketId);
        if (r.isDisputed) revert AlreadyDisputed(marketId);

        uint256 deadline = r.proposalTime + disputeWindow;
        if (block.timestamp < deadline) {
            revert DisputeWindowOpen(marketId, deadline - block.timestamp);
        }

        // No dispute — proposer wins, proposal accepted
        r.status = ResolutionStatus.Finalized;
        r.finalOutcome = r.proposedOutcome;
        r.finalizedTime = block.timestamp;

        // Return bond to proposer
        bool ok = bondToken.transfer(r.proposer, r.proposerBond);
        if (!ok) revert TransferFailed();

        // Resolve on MarketFactory
        marketFactory.resolve(marketId, r.finalOutcome);

        emit ResolutionFinalized(marketId, r.finalOutcome, false);
    }

    /**
     * @notice Admin resolves a disputed market (escalated decision).
     * @param marketId The disputed market
     * @param yesWon The admin's final decision
     */
    function adminResolveDispute(uint256 marketId, bool yesWon) external onlyAdmin {
        Resolution storage r = resolutions[marketId];
        if (r.status != ResolutionStatus.Disputed) revert NotProposed(marketId);

        r.status = ResolutionStatus.Finalized;
        r.finalOutcome = yesWon;
        r.finalizedTime = block.timestamp;

        // Determine winner and loser
        bool proposerCorrect = (r.proposedOutcome == yesWon);
        address winner = proposerCorrect ? r.proposer : r.disputer;
        address loser = proposerCorrect ? r.disputer : r.proposer;
        uint256 loserBond = proposerCorrect ? r.disputerBond : r.proposerBond;
        uint256 winnerBond = proposerCorrect ? r.proposerBond : r.disputerBond;

        // Return winner's bond
        bool ok = bondToken.transfer(winner, winnerBond);
        if (!ok) revert TransferFailed();

        // Slash loser's bond: 50% to winner, 50% to UBI
        uint256 winnerShare = loserBond / 2;
        uint256 ubiShare = loserBond - winnerShare;

        ok = bondToken.transfer(winner, winnerShare);
        if (!ok) revert TransferFailed();

        // Send UBI share to fee splitter
        ok = bondToken.approve(feeSplitter, ubiShare);
        if (!ok) revert TransferFailed();
        IUBIFeeSplitterResolver(feeSplitter).splitFee(ubiShare, address(this));

        // Resolve on MarketFactory
        marketFactory.resolve(marketId, yesWon);

        emit BondSlashed(marketId, loser, winner, winnerShare, ubiShare);
        emit ResolutionFinalized(marketId, yesWon, true);
    }

    /**
     * @notice Emergency admin resolution without dispute flow (for edge cases)
     */
    function emergencyResolve(uint256 marketId, bool yesWon) external onlyAdmin {
        Resolution storage r = resolutions[marketId];
        if (r.status == ResolutionStatus.Finalized) revert AlreadyFinalized(marketId);

        // If there was a proposal, return all bonds
        if (r.proposerBond > 0) {
            bool ok = bondToken.transfer(r.proposer, r.proposerBond);
            if (!ok) revert TransferFailed();
        }
        if (r.disputerBond > 0) {
            bool ok2 = bondToken.transfer(r.disputer, r.disputerBond);
            if (!ok2) revert TransferFailed();
        }

        r.status = ResolutionStatus.Finalized;
        r.finalOutcome = yesWon;
        r.finalizedTime = block.timestamp;

        marketFactory.resolve(marketId, yesWon);
        emit ResolutionFinalized(marketId, yesWon, false);
    }

    // ============ Views ============

    /**
     * @notice Get the resolution state for a market
     */
    function getResolution(uint256 marketId) external view returns (Resolution memory) {
        return resolutions[marketId];
    }

    /**
     * @notice Check if a market resolution is finalized
     */
    function isFinalized(uint256 marketId) external view returns (bool) {
        return resolutions[marketId].status == ResolutionStatus.Finalized;
    }

    /**
     * @notice Get the final outcome (only valid if finalized)
     */
    function getFinalOutcome(uint256 marketId) external view returns (bool) {
        require(resolutions[marketId].status == ResolutionStatus.Finalized, "not finalized");
        return resolutions[marketId].finalOutcome;
    }

    /**
     * @notice Time remaining in dispute window (0 if expired or not proposed)
     */
    function disputeTimeRemaining(uint256 marketId) external view returns (uint256) {
        Resolution storage r = resolutions[marketId];
        if (r.status != ResolutionStatus.Proposed) return 0;
        uint256 deadline = r.proposalTime + disputeWindow;
        if (block.timestamp >= deadline) return 0;
        return deadline - block.timestamp;
    }
}
