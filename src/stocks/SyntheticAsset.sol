// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SyntheticAsset
 * @notice ERC-20 token representing a fractional synthetic equity position.
 *         Only the CollateralVault (the minter) can mint or burn tokens.
 * @dev Deployed by SyntheticAssetFactory for each listed stock.
 *      Tokens are denominated in units of 1e18 = 1 share.
 */
contract SyntheticAsset {
    // ============ ERC-20 State ============

    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    // ============ Roles ============

    /// @notice The only address permitted to mint and burn tokens (CollateralVault)
    address public minter;

    // ============ Events ============

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    // ============ Errors ============

    error NotMinter();
    error InsufficientBalance();
    error InsufficientAllowance();
    error ZeroAddress();
    error AlreadyInitialized();

    // ============ Constructor ============

    constructor(string memory _name, string memory _symbol, address _minter) {
        if (_minter == address(0)) revert ZeroAddress();
        name = _name;
        symbol = _symbol;
        minter = _minter;
    }

    /**
     * @notice One-time initializer for EIP-1167 clone instances.
     *         Reverts if called on a directly-deployed contract (minter already set).
     */
    function initialize(string memory _name, string memory _symbol, address _minter) external {
        if (minter != address(0)) revert AlreadyInitialized();
        if (_minter == address(0)) revert ZeroAddress();
        name = _name;
        symbol = _symbol;
        minter = _minter;
    }

    // ============ ERC-20 ============

    function transfer(address to, uint256 amount) external returns (bool) {
        if (to == address(0)) revert ZeroAddress();
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
        if (to == address(0)) revert ZeroAddress();
        if (balanceOf[from] < amount) revert InsufficientBalance();
        if (allowance[from][msg.sender] < amount) revert InsufficientAllowance();
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }

    // ============ Mint / Burn ============

    function mint(address to, uint256 amount) external {
        if (msg.sender != minter) revert NotMinter();
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function burn(address from, uint256 amount) external {
        if (msg.sender != minter) revert NotMinter();
        if (balanceOf[from] < amount) revert InsufficientBalance();
        totalSupply -= amount;
        balanceOf[from] -= amount;
        emit Transfer(from, address(0), amount);
    }
}
