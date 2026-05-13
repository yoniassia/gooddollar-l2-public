// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/interfaces/IERC20.sol";

/**
 * @title GoodVault — ERC-4626 Auto-Compounding Yield Vault
 * @notice Accepts a single underlying asset, deploys it into a pluggable Strategy,
 *         harvests yield, and routes performance fees to UBI via UBIFeeSplitter.
 *
 * Architecture:
 *   - ERC-4626 compliant (deposit, withdraw, mint, redeem, share math)
 *   - One vault per underlying asset per strategy
 *   - Strategy is swappable by admin (migration support)
 *   - Performance fee (20%) → UBIFeeSplitter on every harvest
 *   - Management fee (2% annual) accrued per-second
 *   - Deposit cap to limit exposure during devnet
 *   - Emergency withdrawal (admin pauses strategy, returns funds)
 */

interface IStrategy {
    function asset() external view returns (address);
    function totalAssets() external view returns (uint256);
    function deposit(uint256 amount) external;
    function withdraw(uint256 amount) external returns (uint256);
    function harvest() external returns (uint256 profit, uint256 loss);
    function emergencyWithdraw() external returns (uint256);
    function paused() external view returns (bool);
}

interface IStrategyWithGains {
    function sweepGains(address token, address to) external;
}

interface IUBIFeeSplitter {
    function splitFeeToken(uint256 totalFee, address dAppRecipient, address token) external;
}

contract GoodVault {
    // ─── ERC-20 Metadata ───
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;

    // ─── ERC-20 State ───
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    // ─── Vault Config ───
    IERC20 public immutable asset;
    IUBIFeeSplitter public ubiFee;
    address public strategy;
    address public admin;
    address public pendingAdmin;

    // ─── Fee Config (BPS) ───
    uint256 public performanceFeeBPS = 2000; // 20% of profit
    uint256 public managementFeeBPS = 200;   // 2% annual

    // ─── Caps & State ───
    uint256 public depositCap;
    uint256 public totalDebt;  // amount deployed to strategy
    uint256 public lastReport; // timestamp of last harvest
    uint256 public totalGainSinceInception;
    uint256 public totalUBIFunded;

    bool public paused;

    // ─── Keeper Access ───
    mapping(address => bool) public keepers;

    // ─── Events ───
    event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares);
    event Withdraw(address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 shares);
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Harvested(uint256 profit, uint256 loss, uint256 ubiFee, uint256 mgmtFee);
    event StrategyMigrated(address indexed oldStrategy, address indexed newStrategy);
    event EmergencyShutdown(uint256 returned);
    event AdminTransferInitiated(address indexed previousAdmin, address indexed pendingAdmin);
    event AdminTransferred(address indexed previousAdmin, address indexed newAdmin);
    event TokenSwept(address indexed token, address indexed to, uint256 amount);
    event KeeperSet(address indexed keeper, bool enabled);

    // ─── Errors ───
    error NotAdmin();
    error Paused();
    error DepositCapExceeded();
    error ZeroShares();
    error ZeroAssets();
    error InsufficientBalance();
    error InsufficientAllowance();
    error StrategyAssetMismatch();
    error Reentrant();
    error TransferFailed();
    error CannotSweepAsset();
    error StrategyDoesNotSupportSweep();
    error NotKeeper();

    bool private _locked;

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

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    modifier onlyKeeper() {
        if (msg.sender != admin && !keepers[msg.sender]) revert NotKeeper();
        _;
    }

    constructor(
        address _asset,
        address _strategy,
        address _ubiFee,
        string memory _name,
        string memory _symbol,
        uint256 _depositCap,
        address _admin
    ) {
        asset = IERC20(_asset);
        strategy = _strategy;
        ubiFee = IUBIFeeSplitter(_ubiFee);
        name = _name;
        symbol = _symbol;
        depositCap = _depositCap;
        admin = _admin != address(0) ? _admin : msg.sender;
        lastReport = block.timestamp;

        if (IStrategy(_strategy).asset() != _asset) revert StrategyAssetMismatch();
    }

    // ═══════════════════════════════════════════════════
    // ERC-4626 View Functions
    // ═══════════════════════════════════════════════════

    /// @notice Total assets under management (idle + strategy value)
    function totalAssets() public view returns (uint256) {
        uint256 idle = asset.balanceOf(address(this));
        if (strategy == address(0)) return idle;
        return idle + IStrategy(strategy).totalAssets();
    }

    /// @notice Shares for a given deposit amount.
    ///         +1 virtual share/asset prevents first-deposit share-inflation attacks
    ///         (EIP-4626 OpenZeppelin mitigation pattern).
    function convertToShares(uint256 assets) public view returns (uint256) {
        return (assets * (totalSupply + 1)) / (totalAssets() + 1);
    }

    /// @notice Assets for a given number of shares.
    function convertToAssets(uint256 shares) public view returns (uint256) {
        return (shares * (totalAssets() + 1)) / (totalSupply + 1);
    }

    function maxDeposit(address) external view returns (uint256) {
        if (paused) return 0;
        uint256 ta = totalAssets();
        return ta >= depositCap ? 0 : depositCap - ta;
    }

    function maxMint(address) external view returns (uint256) {
        if (paused) return 0;
        uint256 ta = totalAssets();
        if (ta >= depositCap) return 0;
        return convertToShares(depositCap - ta);
    }

    function maxWithdraw(address owner) external view returns (uint256) {
        return convertToAssets(balanceOf[owner]);
    }

    function maxRedeem(address owner) external view returns (uint256) {
        return balanceOf[owner];
    }

    function previewDeposit(uint256 assets) external view returns (uint256) {
        return convertToShares(assets);
    }

    /// @notice Assets required to mint exactly `shares` (rounds up).
    function previewMint(uint256 shares) external view returns (uint256) {
        return (shares * (totalAssets() + 1) + totalSupply) / (totalSupply + 1);
    }

    function previewWithdraw(uint256 assets) external view returns (uint256) {
        uint256 ta = totalAssets() + 1;
        return (assets * (totalSupply + 1) + ta - 1) / ta; // round up
    }

    function previewRedeem(uint256 shares) external view returns (uint256) {
        return convertToAssets(shares);
    }

    // ═══════════════════════════════════════════════════
    // ERC-4626 Mutative Functions
    // ═══════════════════════════════════════════════════

    function deposit(uint256 assets, address receiver) external whenNotPaused nonReentrant returns (uint256 shares) {
        if (assets == 0) revert ZeroAssets();
        shares = convertToShares(assets);
        if (shares == 0) revert ZeroShares();
        if (totalAssets() + assets > depositCap) revert DepositCapExceeded();

        if (!asset.transferFrom(msg.sender, address(this), assets)) revert TransferFailed();
        _mint(receiver, shares);

        // Deploy idle funds to strategy
        _deployToStrategy();

        emit Deposit(msg.sender, receiver, assets, shares);
    }

    /// @notice Mint exactly `shares` vault shares; pull the required assets from msg.sender.
    ///         Assets are computed with ceiling division so the vault never receives fewer assets
    ///         than the shares are worth.
    function mint(uint256 shares, address receiver) external whenNotPaused nonReentrant returns (uint256 assets) {
        if (shares == 0) revert ZeroShares();
        // Ceiling division: assets = ceil(shares * (totalAssets+1) / (totalSupply+1))
        assets = (shares * (totalAssets() + 1) + totalSupply) / (totalSupply + 1);
        if (assets == 0) revert ZeroAssets();
        if (totalAssets() + assets > depositCap) revert DepositCapExceeded();

        if (!asset.transferFrom(msg.sender, address(this), assets)) revert TransferFailed();
        _mint(receiver, shares);
        _deployToStrategy();

        emit Deposit(msg.sender, receiver, assets, shares);
    }

    function withdraw(uint256 assets, address receiver, address owner) external nonReentrant returns (uint256 shares) {
        if (assets == 0) revert ZeroAssets();
        uint256 supply = totalSupply;
        uint256 ta = totalAssets() + 1;
        shares = (assets * (supply + 1) + ta - 1) / ta; // round up, virtual-offset safe

        if (msg.sender != owner) {
            uint256 allowed = allowance[owner][msg.sender];
            if (allowed < shares) revert InsufficientAllowance();
            allowance[owner][msg.sender] = allowed - shares;
        }
        if (balanceOf[owner] < shares) revert InsufficientBalance();

        // Withdraw from strategy if needed
        _ensureLiquidity(assets);

        _burn(owner, shares);
        if (!asset.transfer(receiver, assets)) revert TransferFailed();

        emit Withdraw(msg.sender, receiver, owner, assets, shares);
    }

    function redeem(uint256 shares, address receiver, address owner) external nonReentrant returns (uint256 assets) {
        if (shares == 0) revert ZeroShares();
        assets = convertToAssets(shares);
        if (assets == 0) revert ZeroAssets();

        if (msg.sender != owner) {
            uint256 allowed = allowance[owner][msg.sender];
            if (allowed < shares) revert InsufficientAllowance();
            allowance[owner][msg.sender] = allowed - shares;
        }
        if (balanceOf[owner] < shares) revert InsufficientBalance();

        _ensureLiquidity(assets);

        _burn(owner, shares);
        if (!asset.transfer(receiver, assets)) revert TransferFailed();

        emit Withdraw(msg.sender, receiver, owner, assets, shares);
    }

    // ═══════════════════════════════════════════════════
    // Harvest & Fees
    // ═══════════════════════════════════════════════════

    /// @notice Harvest yield from strategy, take fees, compound remainder
    function harvest() external nonReentrant onlyKeeper returns (uint256 profit, uint256 loss) {
        (profit, loss) = IStrategy(strategy).harvest();

        uint256 actualUBIFee;
        uint256 actualMgmtFee;

        if (profit > 0) {
            // Performance fee on profit → UBI
            uint256 _ubiFee = (profit * performanceFeeBPS) / 10000;

            // Management fee: 2% annual on total debt, prorated
            uint256 elapsed = block.timestamp - lastReport;
            uint256 _mgmtFee = (totalDebt * managementFeeBPS * elapsed) / (10000 * 365 days);

            uint256 totalFees = _ubiFee + _mgmtFee;
            if (totalFees > profit) totalFees = profit; // cap at profit

            // Withdraw fees from strategy; use actual amount returned to avoid over-distribution
            if (totalFees > 0) {
                uint256 actualFees = IStrategy(strategy).withdraw(totalFees);
                totalDebt -= actualFees;
                totalFees = actualFees; // clamp to what was actually received

                if (totalFees > 0) {
                    // Route to UBI
                    if (!asset.approve(address(ubiFee), totalFees)) revert TransferFailed();
                    ubiFee.splitFeeToken(totalFees, address(this), address(asset));
                    if (!asset.approve(address(ubiFee), 0)) revert TransferFailed();
                    totalUBIFunded += totalFees;
                    // Split actual fees proportionally between UBI and mgmt for event accuracy
                    uint256 estimatedTotal = _ubiFee + _mgmtFee;
                    if (estimatedTotal > 0) {
                        actualUBIFee = (totalFees * _ubiFee) / estimatedTotal;
                        actualMgmtFee = totalFees - actualUBIFee;
                    } else {
                        actualUBIFee = totalFees;
                    }
                }
            }

            // Sync retained yield into totalDebt so the management fee base stays
            // accurate after compounding. The fee withdrawal was already deducted via
            // `totalDebt -= actualFees` above; the full profit accrued on top of
            // principal, so the net increment is `profit` (not `profit - fees`).
            if (profit > 0) totalDebt += profit;

            totalGainSinceInception += profit - totalFees;
        }

        if (loss > 0) {
            totalDebt = loss >= totalDebt ? 0 : totalDebt - loss;
        }

        lastReport = block.timestamp;
        emit Harvested(profit, loss, actualUBIFee, actualMgmtFee);
    }

    // ═══════════════════════════════════════════════════
    // Strategy Management
    // ═══════════════════════════════════════════════════

    function migrateStrategy(address newStrategy) external onlyAdmin nonReentrant {
        if (IStrategy(newStrategy).asset() != address(asset)) revert StrategyAssetMismatch();

        address old = strategy;

        // Pull everything from old strategy
        if (totalDebt > 0) {
            IStrategy(old).emergencyWithdraw();
            totalDebt = 0;
        }

        strategy = newStrategy;
        _deployToStrategy();

        emit StrategyMigrated(old, newStrategy);
    }

    function emergencyShutdown() external onlyAdmin nonReentrant {
        paused = true;
        uint256 returned;
        if (totalDebt > 0) {
            returned = IStrategy(strategy).emergencyWithdraw();
            totalDebt = 0;
        }
        emit EmergencyShutdown(returned);
    }

    function unpause() external onlyAdmin {
        paused = false;
    }

    function setDepositCap(uint256 _cap) external onlyAdmin {
        depositCap = _cap;
    }

    /// @notice Recover any non-asset token stranded in this vault.
    function sweepToken(address token, address to) external onlyAdmin {
        if (token == address(asset)) revert CannotSweepAsset();
        uint256 bal = IERC20(token).balanceOf(address(this));
        if (bal > 0) {
            if (!IERC20(token).transfer(to, bal)) revert TransferFailed();
            emit TokenSwept(token, to, bal);
        }
    }

    /// @notice Recover any non-asset token stranded in the strategy (e.g. WETH liquidation gains).
    ///         Calls strategy.sweepGains() via low-level call.
    ///         Reverts with StrategyDoesNotSupportSweep if the strategy does not implement sweepGains().
    ///         For Solidity-compiled strategies without a fallback, an unmatched selector triggers the
    ///         ABI dispatcher's built-in revert (ok=false), so the guard fires correctly.
    function sweepStrategyToken(address token, address to) external onlyAdmin {
        (bool ok,) = strategy.call(
            abi.encodeWithSelector(IStrategyWithGains.sweepGains.selector, token, to)
        );
        if (!ok) revert StrategyDoesNotSupportSweep();
    }

    function setKeeper(address keeper, bool enabled) external onlyAdmin {
        keepers[keeper] = enabled;
        emit KeeperSet(keeper, enabled);
    }

    function setFees(uint256 _perfBPS, uint256 _mgmtBPS) external onlyAdmin {
        require(_perfBPS <= 5000, "max 50%");
        require(_mgmtBPS <= 500, "max 5%");
        performanceFeeBPS = _perfBPS;
        managementFeeBPS = _mgmtBPS;
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "GoodVault: zero admin");
        pendingAdmin = newAdmin;
        emit AdminTransferInitiated(admin, newAdmin);
    }

    function acceptAdmin() external {
        require(msg.sender == pendingAdmin, "not pending");
        address previous = admin;
        admin = pendingAdmin;
        pendingAdmin = address(0);
        emit AdminTransferred(previous, admin);
    }

    // ═══════════════════════════════════════════════════
    // Internal
    // ═══════════════════════════════════════════════════

    function _deployToStrategy() internal {
        uint256 idle = asset.balanceOf(address(this));
        if (idle > 0 && !paused) {
            if (!asset.approve(strategy, idle)) revert TransferFailed();
            IStrategy(strategy).deposit(idle);
            if (!asset.approve(strategy, 0)) revert TransferFailed();
            totalDebt += idle;
        }
    }

    function _ensureLiquidity(uint256 needed) internal {
        uint256 idle = asset.balanceOf(address(this));
        if (idle < needed) {
            uint256 deficit = needed - idle;
            uint256 withdrawn = IStrategy(strategy).withdraw(deficit);
            // Clamp to avoid underflow when withdrawn includes unharvested yield
            // that is not yet reflected in totalDebt (yield accrues in strategy
            // but totalDebt is only synced during harvest()).
            totalDebt = withdrawn >= totalDebt ? 0 : totalDebt - withdrawn;
        }
    }

    // ─── ERC-20 Core ───
    function transfer(address to, uint256 amount) external returns (bool) {
        if (balanceOf[msg.sender] < amount) revert InsufficientBalance();
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed < amount) revert InsufficientAllowance();
        if (balanceOf[from] < amount) revert InsufficientBalance();
        allowance[from][msg.sender] = allowed - amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }

    function _mint(address to, uint256 amount) internal {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function _burn(address from, uint256 amount) internal {
        balanceOf[from] -= amount;
        totalSupply -= amount;
        emit Transfer(from, address(0), amount);
    }
}
