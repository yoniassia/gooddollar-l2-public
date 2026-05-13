// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title gUSD — GoodStable USD Stablecoin
 * @notice Manual ERC-20 implementation with permissioned minting/burning.
 *         Only authorized minters (VaultManager, PSM) can mint new gUSD.
 *         Only authorized burners can call burnFrom on behalf of another address.
 */
contract gUSD {
    // ============ ERC-20 Metadata ============

    string public constant name     = "GoodDollar USD";
    string public constant symbol   = "gUSD";
    uint8  public constant decimals = 18;

    // ============ ERC-20 State ============

    uint256 public totalSupply;
    mapping(address => uint256)                     public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    // ============ Access Control ============

    address public admin;
    mapping(address => bool) public isMinter;
    mapping(address => bool) public isBurner;

    // ============ Reentrancy ============
    // Uses 1=unlocked / 2=locked (not 0/1) so the slot is always non-zero.
    // Avoids the cold zero→non-zero SSTORE (20k gas) at function entry that
    // caused eth_estimateGas to underestimate by ~57k gas when drip() calls
    // gusd.mint() for the first time in a mintGUSD tx (GOO-348, same class as GOO-325).

    uint256 private _locked = 1;
    modifier nonReentrant() {
        require(_locked == 1, "Reentrant");
        _locked = 2;
        _;
        _locked = 1;
    }

    // ============ Events ============

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event MinterSet(address indexed account, bool status);
    event BurnerSet(address indexed account, bool status);
    event AdminTransferred(address indexed oldAdmin, address indexed newAdmin);

    // ============ Constructor ============

    constructor(address _admin) {
        require(_admin != address(0), "gUSD: zero admin");
        admin = _admin;
    }

    // ============ Modifiers ============

    modifier onlyAdmin() {
        require(msg.sender == admin, "gUSD: not admin");
        _;
    }

    // ============ Admin ============

    function setMinter(address account, bool status) external onlyAdmin {
        require(account != address(0), "gUSD: zero address");
        isMinter[account] = status;
        emit MinterSet(account, status);
    }

    function setBurner(address account, bool status) external onlyAdmin {
        require(account != address(0), "gUSD: zero address");
        isBurner[account] = status;
        emit BurnerSet(account, status);
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "gUSD: zero address");
        emit AdminTransferred(admin, newAdmin);
        admin = newAdmin;
    }

    // ============ Minting / Burning ============

    /**
     * @notice Mint gUSD to `to`. Only callable by authorized minters.
     */
    function mint(address to, uint256 amount) external nonReentrant {
        require(isMinter[msg.sender], "gUSD: not minter");
        require(to != address(0), "gUSD: mint to zero");
        require(amount > 0, "gUSD: zero amount");
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    /**
     * @notice Burn gUSD from caller's own balance.
     */
    function burn(uint256 amount) external nonReentrant {
        require(amount > 0, "gUSD: zero amount");
        require(balanceOf[msg.sender] >= amount, "gUSD: insufficient balance");
        balanceOf[msg.sender] -= amount;
        totalSupply -= amount;
        emit Transfer(msg.sender, address(0), amount);
    }

    /**
     * @notice Burn gUSD from `from`. Only callable by authorized burners.
     *         Consumes allowance unless burner is the `from` address itself.
     */
    function burnFrom(address from, uint256 amount) external nonReentrant {
        require(isBurner[msg.sender], "gUSD: not burner");
        require(amount > 0, "gUSD: zero amount");
        if (msg.sender != from) {
            uint256 currentAllowance = allowance[from][msg.sender];
            require(currentAllowance >= amount, "gUSD: insufficient allowance");
            allowance[from][msg.sender] = currentAllowance - amount;
        }
        require(balanceOf[from] >= amount, "gUSD: insufficient balance");
        balanceOf[from] -= amount;
        totalSupply -= amount;
        emit Transfer(from, address(0), amount);
    }

    // ============ ERC-20 Core ============

    function transfer(address to, uint256 amount) external nonReentrant returns (bool) {
        require(to != address(0), "gUSD: transfer to zero");
        require(balanceOf[msg.sender] >= amount, "gUSD: insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        require(spender != address(0), "gUSD: approve to zero");
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external nonReentrant returns (bool) {
        require(to != address(0), "gUSD: transfer to zero");
        uint256 currentAllowance = allowance[from][msg.sender];
        if (currentAllowance != type(uint256).max) {
            require(currentAllowance >= amount, "gUSD: insufficient allowance");
            allowance[from][msg.sender] = currentAllowance - amount;
        }
        require(balanceOf[from] >= amount, "gUSD: insufficient balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}
