// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./ConditionalTokens.sol";

/**
 * @title MarketFactory
 * @notice Creates and resolves GoodPredict binary outcome markets.
 *
 *         Flow:
 *           1. Admin creates a market with a question and resolution deadline.
 *           2. Anyone can buy YES/NO tokens by depositing G$ (1:1 collateral).
 *              Each purchase mints both YES and NO tokens to a pool; caller
 *              receives the side they want.
 *           3. After deadline, a resolver (oracle/admin) calls resolve(YES/NO).
 *           4. Winners redeem YES (if YES wins) or NO (if NO wins) tokens for G$.
 *              A 1% fee is charged on winnings and routed to the UBI fee splitter.
 */

interface IPredictToken {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface IUBIFeeSplitterPredict {
    function splitFee(uint256 totalFee, address dAppRecipient) external returns (uint256 ubiShare, uint256 protocolShare, uint256 dAppShare);
}

contract MarketFactory {
    // ============ Types ============

    enum MarketStatus { Open, Closed, ResolvedYES, ResolvedNO, Voided }

    struct Market {
        string question;
        uint256 endTime;
        MarketStatus status;
        uint256 totalYES;        // total YES tokens issued
        uint256 totalNO;         // total NO tokens issued
        uint256 collateral;      // total G$ locked
        address resolver;        // who can resolve this market
    }

    // ============ State ============

    ConditionalTokens public immutable tokens;
    IPredictToken public immutable goodDollar;
    address public immutable feeSplitter;
    address public admin;

    Market[] public markets;

    uint256 public constant REDEEM_FEE_BPS = 100; // 1%
    uint256 public constant BPS = 10000;

    // ============ Events ============

    event MarketCreated(uint256 indexed marketId, string question, uint256 endTime, address resolver);
    event Bought(uint256 indexed marketId, address indexed buyer, bool isYES, uint256 amount, uint256 cost);
    event Redeemed(uint256 indexed marketId, address indexed redeemer, uint256 amount, uint256 payout);
    event MarketResolved(uint256 indexed marketId, MarketStatus result);
    event MarketVoided(uint256 indexed marketId);

    // ============ Errors ============

    error NotAdmin();
    error ZeroAddress();
    error ZeroAmount();
    error MarketNotOpen();
    error MarketNotClosed();
    error MarketNotResolved();
    error MarketExpired();
    error MarketNotExpired();
    error Unauthorized();
    error TransferFailed();

    // ============ Modifiers ============

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    // ============ Constructor ============

    constructor(address _goodDollar, address _feeSplitter, address _admin) {
        if (_goodDollar == address(0)) revert ZeroAddress();
        if (_feeSplitter == address(0)) revert ZeroAddress();
        if (_admin == address(0)) revert ZeroAddress();

        goodDollar = IPredictToken(_goodDollar);
        feeSplitter = _feeSplitter;
        admin = _admin;

        tokens = new ConditionalTokens(address(this));
    }

    // ============ Market Creation ============

    /**
     * @notice Create a new binary outcome market.
     * @param question Human-readable question (e.g., "Will BTC exceed $100k by 2026?")
     * @param endTime UNIX timestamp when trading closes
     * @param resolver Address authorised to resolve this market (admin if zero)
     * @return marketId Index in the markets array
     */
    function createMarket(
        string calldata question,
        uint256 endTime,
        address resolver
    ) external onlyAdmin returns (uint256 marketId) {
        if (endTime <= block.timestamp) revert MarketExpired();
        address res = resolver == address(0) ? admin : resolver;

        marketId = markets.length;
        markets.push(Market({
            question: question,
            endTime: endTime,
            status: MarketStatus.Open,
            totalYES: 0,
            totalNO: 0,
            collateral: 0,
            resolver: res
        }));

        emit MarketCreated(marketId, question, endTime, res);
    }

    // ============ Trading ============

    /**
     * @notice Buy YES or NO outcome tokens for a market.
     * @param marketId Market index
     * @param isYES True for YES tokens, false for NO tokens
     * @param amount Number of outcome tokens to buy (1e18 = 1 token = 1 G$)
     */
    function buy(uint256 marketId, bool isYES, uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        Market storage m = markets[marketId];
        if (m.status != MarketStatus.Open) revert MarketNotOpen();
        if (block.timestamp >= m.endTime) revert MarketExpired();

        // Each token costs 1 G$
        bool ok = goodDollar.transferFrom(msg.sender, address(this), amount);
        if (!ok) revert TransferFailed();

        m.collateral += amount;

        uint256 tokenId = isYES ? marketId * 2 : marketId * 2 + 1;
        if (isYES) {
            m.totalYES += amount;
        } else {
            m.totalNO += amount;
        }

        tokens.mint(msg.sender, tokenId, amount);
        emit Bought(marketId, msg.sender, isYES, amount, amount);
    }

    // ============ Resolution ============

    /**
     * @notice Close a market after its end time (required before resolution).
     */
    function closeMarket(uint256 marketId) external {
        Market storage m = markets[marketId];
        if (m.status != MarketStatus.Open) revert MarketNotOpen();
        if (block.timestamp < m.endTime) revert MarketNotExpired();
        m.status = MarketStatus.Closed;
    }

    /**
     * @notice Resolve a market as YES or NO.
     * @param marketId Market index
     * @param yesWon True if YES outcome wins
     */
    function resolve(uint256 marketId, bool yesWon) external {
        Market storage m = markets[marketId];
        if (m.status != MarketStatus.Closed) revert MarketNotClosed();
        if (msg.sender != m.resolver && msg.sender != admin) revert Unauthorized();

        m.status = yesWon ? MarketStatus.ResolvedYES : MarketStatus.ResolvedNO;
        emit MarketResolved(marketId, m.status);
    }

    /**
     * @notice Void a market (return collateral 1:1 to token holders).
     * @dev Used when resolution is impossible or disputed.
     */
    function voidMarket(uint256 marketId) external onlyAdmin {
        Market storage m = markets[marketId];
        if (m.status != MarketStatus.Open && m.status != MarketStatus.Closed) {
            revert MarketNotOpen();
        }
        m.status = MarketStatus.Voided;
        emit MarketVoided(marketId);
    }

    // ============ Redemption ============

    /**
     * @notice Redeem winning tokens for G$.
     * @param marketId Market index
     * @param amount Number of winning tokens to redeem
     */
    function redeem(uint256 marketId, uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        Market storage m = markets[marketId];

        bool isVoided = m.status == MarketStatus.Voided;
        bool isYESWin = m.status == MarketStatus.ResolvedYES;
        bool isNOWin = m.status == MarketStatus.ResolvedNO;

        if (!isVoided && !isYESWin && !isNOWin) revert MarketNotResolved();

        uint256 tokenId;
        uint256 payout;
        uint256 collateralDecrement;
        uint256 fee;

        if (isVoided) {
            // Redeem either YES or NO at 1:1 (both valid)
            // Try YES first, then NO
            uint256 yesId = marketId * 2;
            uint256 noId = marketId * 2 + 1;
            if (tokens.balanceOf(msg.sender, yesId) >= amount) {
                tokenId = yesId;
            } else {
                tokenId = noId;
            }
            payout = amount; // 1:1 no fee on void
            collateralDecrement = amount;
        } else {
            tokenId = isYESWin ? marketId * 2 : marketId * 2 + 1;
            uint256 winningSupply = isYESWin ? m.totalYES : m.totalNO;

            // Pro-rata share of total collateral (gross, before fee)
            uint256 grossPayout = (amount * m.collateral) / winningSupply;

            // Deduct 1% fee, route to UBI via fee splitter
            fee = (grossPayout * REDEEM_FEE_BPS) / BPS;
            payout = grossPayout - fee;
            collateralDecrement = grossPayout; // full gross amount leaves the contract
        }

        // CEI: effects before interactions
        tokens.burn(msg.sender, tokenId, amount);
        m.collateral -= collateralDecrement;

        if (fee > 0) {
            goodDollar.approve(feeSplitter, fee);
            IUBIFeeSplitterPredict(feeSplitter).splitFee(fee, address(this));
        }

        bool ok2 = goodDollar.transfer(msg.sender, payout);
        if (!ok2) revert TransferFailed();

        emit Redeemed(marketId, msg.sender, amount, payout);
    }

    // ============ View ============

    function marketCount() external view returns (uint256) {
        return markets.length;
    }

    function getMarket(uint256 marketId)
        external
        view
        returns (
            string memory question,
            uint256 endTime,
            MarketStatus status,
            uint256 totalYES,
            uint256 totalNO,
            uint256 collateral
        )
    {
        Market storage m = markets[marketId];
        return (m.question, m.endTime, m.status, m.totalYES, m.totalNO, m.collateral);
    }

    /**
     * @notice Implied probability of YES winning, in BPS (5000 = 50%)
     * @dev Simple constant-product approximation: YES / (YES + NO)
     */
    function impliedProbabilityYES(uint256 marketId) external view returns (uint256) {
        Market storage m = markets[marketId];
        uint256 total = m.totalYES + m.totalNO;
        if (total == 0) return 5000; // 50% when no bets yet
        return (m.totalYES * BPS) / total;
    }

    // ============ Admin ============

    function setAdmin(address newAdmin) external onlyAdmin {
        if (newAdmin == address(0)) revert ZeroAddress();
        admin = newAdmin;
    }
}
