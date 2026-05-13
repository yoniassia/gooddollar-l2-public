// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./SyntheticAsset.sol";
import "./PriceOracle.sol";

/**
 * @title CollateralVault
 * @notice Core GoodStocks contract. Users deposit G$ as collateral and mint
 *         synthetic stock tokens at a minimum 150% collateral ratio.
 *
 *         Fee model: 0.3% of the USD value of each mint/burn is charged in G$
 *         and forwarded to the UBI fee splitter (33% -> UBI pool).
 *
 *         Liquidation: anyone can liquidate a position whose collateral ratio
 *         falls below LIQUIDATION_RATIO (120%). The liquidator provides the
 *         synthetic tokens, receives debt value in G$ plus a 10% bonus,
 *         and the remaining collateral is forwarded to the fee splitter.
 */

interface IGoodDollarToken {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface IUBIFeeSplitter {
    function splitFee(uint256 totalFee, address dAppRecipient) external returns (uint256 ubiShare, uint256 protocolShare, uint256 dAppShare);
}

contract CollateralVault {
    // ============ Constants ============

    /// @notice Minimum collateral ratio to open a position (150%)
    uint256 public constant MIN_COLLATERAL_RATIO = 15000; // basis points: 15000 = 150%

    /// @notice Collateral ratio below which liquidation is allowed (120%)
    uint256 public constant LIQUIDATION_RATIO = 12000;

    /// @notice Liquidator bonus expressed as percentage of the repaid debt value (10%)
    uint256 public constant LIQUIDATION_BONUS_BPS = 1000;

    /// @notice Mint/burn fee in basis points (0.3%)
    uint256 public constant TRADE_FEE_BPS = 30;

    uint256 public constant BPS = 10000;

    // ============ State ============

    IGoodDollarToken public immutable goodDollar;
    PriceOracle public immutable oracle;
    address public immutable feeSplitter;
    address public admin;

    bool public paused;

    /// @notice user -> ticker key -> collateral deposited (G$ with 18 decimals)
    mapping(address => mapping(bytes32 => uint256)) public collateral;

    /// @notice user -> ticker key -> synthetic tokens minted (18 decimals = 1 share)
    mapping(address => mapping(bytes32 => uint256)) public debt;

    /// @notice total G$ locked per ticker
    mapping(bytes32 => uint256) public totalCollateral;

    /// @notice Registered synthetic assets: ticker key -> SyntheticAsset
    mapping(bytes32 => address) public syntheticAssets;
    /// @notice ticker key -> oracle key (same by default, but separable)
    mapping(bytes32 => bytes32) public oracleKeys;

    // ============ Events ============

    event CollateralDeposited(address indexed user, bytes32 indexed ticker, uint256 amount);
    event CollateralWithdrawn(address indexed user, bytes32 indexed ticker, uint256 amount);
    event Minted(address indexed user, bytes32 indexed ticker, uint256 syntheticAmount, uint256 collateralUsed, uint256 fee);
    event Burned(address indexed user, bytes32 indexed ticker, uint256 syntheticAmount, uint256 collateralReturned, uint256 fee);
    event Liquidated(
        address indexed liquidator,
        address indexed user,
        bytes32 indexed ticker,
        uint256 syntheticRepaid,
        uint256 collateralSeized,
        uint256 bonus
    );
    event AssetRegistered(bytes32 indexed key, string ticker, address syntheticAsset);

    // ============ Errors ============

    error NotAdmin();
    error ZeroAddress();
    error ZeroAmount();
    error DepositTooSmall(uint256 amount, uint256 minimum);
    error Paused();
    error AssetNotRegistered(bytes32 key);
    error InsufficientCollateral(uint256 have, uint256 need);
    error CollateralRatioTooLow(uint256 ratio, uint256 minimum);
    error PositionHealthy(uint256 ratio, uint256 liquidationThreshold);
    error InsufficientDebt(uint256 have, uint256 repay);
    error TransferFailed();

    // ============ Modifiers ============

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    // ============ Constructor ============

    constructor(
        address _goodDollar,
        address _oracle,
        address _feeSplitter,
        address _admin
    ) {
        if (_goodDollar == address(0)) revert ZeroAddress();
        if (_oracle == address(0)) revert ZeroAddress();
        if (_feeSplitter == address(0)) revert ZeroAddress();
        if (_admin == address(0)) revert ZeroAddress();

        goodDollar = IGoodDollarToken(_goodDollar);
        oracle = PriceOracle(_oracle);
        feeSplitter = _feeSplitter;
        admin = _admin;
    }

    // ============ Admin ============

    /**
     * @notice Register a synthetic asset with this vault.
     * @param ticker String ticker (e.g., "AAPL")
     * @param syntheticAsset Address of the SyntheticAsset ERC-20
     */
    function registerAsset(string calldata ticker, address syntheticAsset) external onlyAdmin {
        if (syntheticAsset == address(0)) revert ZeroAddress();
        bytes32 key = _key(ticker);
        syntheticAssets[key] = syntheticAsset;
        oracleKeys[key] = key; // by default same key
        emit AssetRegistered(key, ticker, syntheticAsset);
    }

    function setPaused(bool _paused) external onlyAdmin {
        paused = _paused;
    }

    function setAdmin(address newAdmin) external onlyAdmin {
        if (newAdmin == address(0)) revert ZeroAddress();
        admin = newAdmin;
    }

    // ============ User: Collateral Management ============

    /**
     * @notice Deposit G$ collateral for a specific synthetic asset position.
     * @param ticker Stock ticker
     * @param amount G$ amount (18 decimals)
     */
    /// @dev Minimum 0.001 GDT (1e15 wei). Guards against accidental USDC-scaled deposits
    ///      (e.g. passing 500_000_000 for "500 USDC" when vault expects 18-decimal GDT).
    uint256 public constant MIN_DEPOSIT = 1e15;

    function depositCollateral(string calldata ticker, uint256 amount) external whenNotPaused {
        if (amount == 0) revert ZeroAmount();
        if (amount < MIN_DEPOSIT) revert DepositTooSmall(amount, MIN_DEPOSIT);
        bytes32 key = _key(ticker);
        _depositCollateral(key, amount);
    }

    function _depositCollateral(bytes32 key, uint256 amount) internal {
        if (syntheticAssets[key] == address(0)) revert AssetNotRegistered(key);

        bool ok = goodDollar.transferFrom(msg.sender, address(this), amount);
        if (!ok) revert TransferFailed();

        collateral[msg.sender][key] += amount;
        totalCollateral[key] += amount;

        emit CollateralDeposited(msg.sender, key, amount);
    }

    /**
     * @notice Deposit collateral and immediately mint synthetic tokens in one transaction.
     * @dev Fixes GOO-177: eth_call simulations of sequential depositCollateral+mint calls
     *      returned false InsufficientCollateral reverts because state from the deposit
     *      simulation was not visible to the separate mint simulation. This combined
     *      function allows the full flow to be simulated as a single eth_call.
     * @param ticker Stock ticker
     * @param collateralAmount G$ to deposit as collateral (18 decimals)
     * @param syntheticAmount Synthetic tokens to mint (18 decimals = 1 share)
     */
    function depositAndMint(
        string calldata ticker,
        uint256 collateralAmount,
        uint256 syntheticAmount
    ) external whenNotPaused {
        bytes32 key = _key(ticker);
        if (collateralAmount > 0) {
            _depositCollateral(key, collateralAmount);
        }
        _mint(key, syntheticAmount);
    }

    /**
     * @notice Withdraw excess collateral, provided the position remains above MIN_COLLATERAL_RATIO.
     * @param ticker Stock ticker
     * @param amount G$ amount to withdraw
     */
    function withdrawCollateral(string calldata ticker, uint256 amount) external whenNotPaused {
        if (amount == 0) revert ZeroAmount();
        bytes32 key = _key(ticker);

        uint256 userCollateral = collateral[msg.sender][key];
        if (userCollateral < amount) revert InsufficientCollateral(userCollateral, amount);

        uint256 remaining = userCollateral - amount;
        uint256 userDebt = debt[msg.sender][key];

        if (userDebt > 0) {
            // Check that remaining collateral still covers the position
            uint256 stockPrice = oracle.getPriceByKey(oracleKeys[key]); // 8 decimals
            uint256 debtValueUSD8 = (userDebt * stockPrice) / 1e18; // USD with 8 decimals
            // G$ is 1:1 USD approximation; treat 1 G$ = 1 USD (8-decimal adjusted)
            uint256 remainingUSD8 = remaining * 1e8 / 1e18;
            uint256 ratio = (remainingUSD8 * BPS) / debtValueUSD8;
            if (ratio < MIN_COLLATERAL_RATIO) {
                revert CollateralRatioTooLow(ratio, MIN_COLLATERAL_RATIO);
            }
        }

        collateral[msg.sender][key] = remaining;
        totalCollateral[key] -= amount;

        bool ok = goodDollar.transfer(msg.sender, amount);
        if (!ok) revert TransferFailed();

        emit CollateralWithdrawn(msg.sender, key, amount);
    }

    // ============ User: Mint / Burn ============

    /**
     * @notice Mint synthetic stock tokens against deposited collateral.
     * @param ticker Stock ticker
     * @param syntheticAmount Amount of synthetic tokens to mint (1e18 = 1 share)
     */
    function mint(string calldata ticker, uint256 syntheticAmount) external whenNotPaused {
        _mint(_key(ticker), syntheticAmount);
    }

    function _mint(bytes32 key, uint256 syntheticAmount) internal {
        if (syntheticAmount == 0) revert ZeroAmount();
        address syntheticAsset = syntheticAssets[key];
        if (syntheticAsset == address(0)) revert AssetNotRegistered(key);

        (uint256 requiredCollateralG, uint256 fee) = _mintRequirements(key, syntheticAmount);

        uint256 userCollateral = collateral[msg.sender][key];
        uint256 alreadyUsed = _collateralUsed(msg.sender, key);
        uint256 availableCollateral = userCollateral > alreadyUsed ? userCollateral - alreadyUsed : 0;

        // Collateral check covers only the backing requirement; fee is paid separately from wallet.
        if (availableCollateral < requiredCollateralG) {
            revert InsufficientCollateral(availableCollateral, requiredCollateralG);
        }

        debt[msg.sender][key] += syntheticAmount;

        // Fee is transferred directly from the caller's wallet so it does not reduce
        // the collateral backing the position.
        if (fee > 0) {
            bool ok = goodDollar.transferFrom(msg.sender, address(this), fee);
            if (!ok) revert TransferFailed();
            goodDollar.approve(feeSplitter, fee);
            IUBIFeeSplitter(feeSplitter).splitFee(fee, address(this));
        }

        SyntheticAsset(syntheticAsset).mint(msg.sender, syntheticAmount);
        emit Minted(msg.sender, key, syntheticAmount, requiredCollateralG, fee);
    }

    /// @dev Returns (requiredCollateralG, fee) for a mint of syntheticAmount units.
    function _mintRequirements(bytes32 key, uint256 syntheticAmount)
        internal
        view
        returns (uint256 requiredCollateralG, uint256 fee)
    {
        uint256 stockPrice = oracle.getPriceByKey(oracleKeys[key]);
        uint256 positionValueUSD8 = (syntheticAmount * stockPrice) / 1e18;
        uint256 requiredUSD8 = (positionValueUSD8 * MIN_COLLATERAL_RATIO) / BPS;
        requiredCollateralG = (requiredUSD8 * 1e18) / 1e8;
        uint256 positionValueG = (positionValueUSD8 * 1e18) / 1e8;
        fee = (positionValueG * TRADE_FEE_BPS) / BPS;
    }

    /**
     * @notice Burn synthetic tokens and release collateral proportionally.
     * @param ticker Stock ticker
     * @param syntheticAmount Amount of synthetic tokens to burn
     */
    function burn(string calldata ticker, uint256 syntheticAmount) external whenNotPaused {
        if (syntheticAmount == 0) revert ZeroAmount();
        bytes32 key = _key(ticker);
        address syntheticAsset = syntheticAssets[key];
        if (syntheticAsset == address(0)) revert AssetNotRegistered(key);

        uint256 userDebt = debt[msg.sender][key];
        if (syntheticAmount > userDebt) revert InsufficientDebt(userDebt, syntheticAmount);

        uint256 stockPrice = oracle.getPriceByKey(oracleKeys[key]);
        uint256 positionValueUSD8 = (syntheticAmount * stockPrice) / 1e18;
        uint256 positionValueG = (positionValueUSD8 * 1e18) / 1e8;

        // Fee on burn
        uint256 fee = (positionValueG * TRADE_FEE_BPS) / BPS;

        // Collateral to release: proportional to debt being repaid
        // Release = (syntheticAmount / totalDebt) * totalCollateral (minus fee)
        uint256 collateralToRelease = (collateral[msg.sender][key] * syntheticAmount) / userDebt;
        if (collateralToRelease > fee) {
            collateralToRelease -= fee;
        } else {
            collateralToRelease = 0;
            fee = 0;
        }

        debt[msg.sender][key] -= syntheticAmount;
        collateral[msg.sender][key] -= (collateralToRelease + fee);
        totalCollateral[key] -= (collateralToRelease + fee);

        SyntheticAsset(syntheticAsset).burn(msg.sender, syntheticAmount);

        if (fee > 0) {
            goodDollar.approve(feeSplitter, fee);
            IUBIFeeSplitter(feeSplitter).splitFee(fee, address(this));
        }

        if (collateralToRelease > 0) {
            bool ok2 = goodDollar.transfer(msg.sender, collateralToRelease);
            if (!ok2) revert TransferFailed();
        }

        emit Burned(msg.sender, key, syntheticAmount, collateralToRelease, fee);
    }

    // ============ Liquidation ============

    /**
     * @notice Liquidate an undercollateralized position.
     * @dev Caller must hold sufficient synthetic tokens to repay the full debt.
     *      Caller receives the debt value in G$ plus a 10% bonus; remainder goes
     *      to the fee splitter (funds UBI).
     * @param user Address of the position owner to liquidate
     * @param ticker Stock ticker
     */
    function liquidate(address user, string calldata ticker) external whenNotPaused {
        bytes32 key = _key(ticker);
        address syntheticAsset = syntheticAssets[key];
        if (syntheticAsset == address(0)) revert AssetNotRegistered(key);

        uint256 userDebt = debt[user][key];
        uint256 userCollateral = collateral[user][key];

        // No debt means nothing to liquidate -- prevents free collateral drain
        if (userDebt == 0) revert PositionHealthy(type(uint256).max, LIQUIDATION_RATIO);

        // Calculation extracted to helper to keep stack depth within EVM limit
        // (forge coverage disables the optimizer, so every local variable counts).
        (uint256 debtValueG, uint256 liquidatorReward, uint256 remainingCollateral) =
            _calcLiquidationAmounts(userDebt, userCollateral, key);

        // CEI: clear state before external calls
        collateral[user][key] = 0;
        debt[user][key] = 0;
        totalCollateral[key] -= userCollateral;

        // Liquidator repays full synthetic debt
        SyntheticAsset(syntheticAsset).burn(msg.sender, userDebt);

        if (liquidatorReward > 0) {
            bool ok = goodDollar.transfer(msg.sender, liquidatorReward);
            if (!ok) revert TransferFailed();
        }

        // Remaining collateral goes to feeSplitter (funds UBI)
        if (remainingCollateral > 0) {
            goodDollar.approve(feeSplitter, remainingCollateral);
            IUBIFeeSplitter(feeSplitter).splitFee(remainingCollateral, address(this));
        }

        uint256 actualBonus = liquidatorReward > debtValueG ? liquidatorReward - debtValueG : 0;
        emit Liquidated(msg.sender, user, key, userDebt, liquidatorReward, actualBonus);
    }

    /**
     * @dev Validate the position is unhealthy and compute liquidation amounts.
     *      Extracted from `liquidate` to keep stack depth within EVM limit for forge coverage.
     *
     * @return debtValueG        Debt value in G$ (18 dec).
     * @return liquidatorReward  G$ reward for the liquidator (debt value + 10% bonus, capped).
     * @return remainingCollateral Leftover collateral routed to UBI fee splitter.
     */
    function _calcLiquidationAmounts(
        uint256 userDebt,
        uint256 userCollateral,
        bytes32 key
    ) internal view returns (uint256 debtValueG, uint256 liquidatorReward, uint256 remainingCollateral) {
        uint256 stockPrice    = oracle.getPriceByKey(oracleKeys[key]);
        uint256 debtValueUSD8 = (userDebt * stockPrice) / 1e18;
        uint256 collUSD8      = (userCollateral * 1e8) / 1e18;
        uint256 ratio         = (collUSD8 * BPS) / debtValueUSD8;
        if (ratio >= LIQUIDATION_RATIO) revert PositionHealthy(ratio, LIQUIDATION_RATIO);

        // Liquidator receives: debt value in G$ + 10% bonus
        debtValueG = (debtValueUSD8 * 1e18) / 1e8;
        uint256 bonus = (debtValueG * LIQUIDATION_BONUS_BPS) / BPS;
        liquidatorReward = debtValueG + bonus;
        // Cap at available collateral (edge case: extreme oracle move)
        if (liquidatorReward > userCollateral) liquidatorReward = userCollateral;
        remainingCollateral = userCollateral - liquidatorReward;
    }

    // ============ View ============

    /**
     * @notice Get the collateral ratio for a user's position (in BPS, e.g. 15000 = 150%)
     * @return ratio Collateral ratio in BPS; type(uint256).max if no debt
     */
    function getCollateralRatio(address user, string calldata ticker) external view returns (uint256 ratio) {
        bytes32 key = _key(ticker);
        uint256 userDebt = debt[user][key];
        if (userDebt == 0) return type(uint256).max;

        uint256 stockPrice = oracle.getPriceByKey(oracleKeys[key]);
        uint256 debtValueUSD8 = (userDebt * stockPrice) / 1e18;
        uint256 collateralUSD8 = (collateral[user][key] * 1e8) / 1e18;
        return (collateralUSD8 * BPS) / debtValueUSD8;
    }

    /**
     * @notice Get position info for a user
     */
    function getPosition(address user, string calldata ticker)
        external
        view
        returns (uint256 userCollateral, uint256 userDebt, uint256 ratio)
    {
        bytes32 key = _key(ticker);
        userCollateral = collateral[user][key];
        userDebt = debt[user][key];
        if (userDebt == 0) {
            ratio = type(uint256).max;
        } else {
            uint256 stockPrice = oracle.getPriceByKey(oracleKeys[key]);
            uint256 debtValueUSD8 = (userDebt * stockPrice) / 1e18;
            uint256 collateralUSD8 = (userCollateral * 1e8) / 1e18;
            ratio = (collateralUSD8 * BPS) / debtValueUSD8;
        }
    }

    /**
     * @notice Preview a mint: returns collateral/fee requirements and whether the user
     *         can mint now (with optional pending collateral deposit included).
     * @dev Use this for eth_call simulations instead of simulating the full mint flow.
     *      Passing additionalCollateral lets the frontend account for a pending deposit
     *      in the same simulation without needing a sequential two-call approach.
     * @param user        Position owner
     * @param ticker      Stock ticker
     * @param syntheticAmount Tokens to mint (1e18 = 1 share)
     * @param additionalCollateral Extra G$ the user would deposit before minting (may be 0)
     * @return requiredCollateral Minimum collateral backing needed for this mint at 150% CR
     * @return fee               G$ fee charged from wallet (not from collateral)
     * @return available         Collateral available after accounting for existing debt and pending deposit
     * @return canMint           True if available >= requiredCollateral
     */
    function getMintRequirements(
        address user,
        string calldata ticker,
        uint256 syntheticAmount,
        uint256 additionalCollateral
    ) external view returns (
        uint256 requiredCollateral,
        uint256 fee,
        uint256 available,
        bool canMint
    ) {
        bytes32 key = _key(ticker);
        // Both helpers keep stack depth within EVM limit when optimizer is off
        // (forge coverage). Every named return and local var occupies a slot.
        (requiredCollateral, fee) = _calcMintRequiredAndFee(key, syntheticAmount);
        (available, canMint) = _calcAvailable(user, key, additionalCollateral, requiredCollateral);
    }

    /**
     * @dev Compute the available collateral and canMint flag.
     *      Extracted from `getMintRequirements` to reduce stack depth for forge coverage.
     */
    function _calcAvailable(
        address user,
        bytes32 key,
        uint256 additionalCollateral,
        uint256 requiredCollateral
    ) internal view returns (uint256 available, bool canMint) {
        uint256 userCollateral = collateral[user][key] + additionalCollateral;
        uint256 alreadyUsed = _collateralUsed(user, key);
        available = userCollateral > alreadyUsed ? userCollateral - alreadyUsed : 0;
        canMint = available >= requiredCollateral;
    }

    /**
     * @dev Compute the required collateral and fee for a mint.
     *      Extracted from `getMintRequirements` to reduce stack depth for forge coverage.
     */
    function _calcMintRequiredAndFee(
        bytes32 key,
        uint256 syntheticAmount
    ) internal view returns (uint256 requiredCollateral, uint256 fee) {
        uint256 stockPrice      = oracle.getPriceByKey(oracleKeys[key]);
        uint256 positionValueUSD8 = (syntheticAmount * stockPrice) / 1e18;
        uint256 requiredUSD8    = (positionValueUSD8 * MIN_COLLATERAL_RATIO) / BPS;
        requiredCollateral      = (requiredUSD8 * 1e18) / 1e8;
        uint256 positionValueG  = (positionValueUSD8 * 1e18) / 1e8;
        fee                     = (positionValueG * TRADE_FEE_BPS) / BPS;
    }

    // ============ Internals ============

    /// @notice How much collateral is currently committed to backing active debt
    function _collateralUsed(address user, bytes32 key) internal view returns (uint256) {
        uint256 userDebt = debt[user][key];
        if (userDebt == 0) return 0;
        uint256 stockPrice = oracle.getPriceByKey(oracleKeys[key]);
        uint256 debtValueUSD8 = (userDebt * stockPrice) / 1e18;
        // Required at MIN_COLLATERAL_RATIO
        uint256 requiredUSD8 = (debtValueUSD8 * MIN_COLLATERAL_RATIO) / BPS;
        return (requiredUSD8 * 1e18) / 1e8;
    }

    function _key(string calldata ticker) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(ticker));
    }
}
