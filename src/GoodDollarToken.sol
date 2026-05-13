// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/interfaces/IERC20.sol";

/**
 * @title GoodDollar Token (G$) — L2 Native
 * @notice The native UBI token of the GoodDollar L2 chain.
 * @dev Deployed as a precompile on the L2 genesis. Supports:
 *   - Daily UBI claims for verified humans
 *   - Fee collection from all dApps → UBI pool
 *   - Validator staking
 */
contract GoodDollarToken {
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
    
    // Identity & Claims
    mapping(address => bool) public isVerifiedHuman;
    mapping(address => uint256) public lastClaimTime;
    uint256 public totalVerifiedHumans;
    
    // Governance
    address public admin;
    address public identityOracle; // Updates verified status

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
    
    modifier onlyAdmin() {
        require(msg.sender == admin, "Not admin");
        _;
    }
    
    modifier onlyIdentityOracle() {
        require(msg.sender == identityOracle, "Not identity oracle");
        _;
    }

    modifier onlyMinter() {
        require(minters[msg.sender], "Not authorized minter");
        _;
    }
    
    /**
     * @notice Initialize the GoodDollar token with admin and identity oracle.
     * @param _admin Address with administrative privileges
     * @param _identityOracle Address that can verify/unverify humans
     * @param _initialSupply Initial token supply minted to the admin
     */
    constructor(address _admin, address _identityOracle, uint256 _initialSupply) {
        admin = _admin;
        identityOracle = _identityOracle;
        _mint(_admin, _initialSupply);
    }
    
    // ============ ERC20 Standard ============

    /**
     * @notice Transfer tokens to another address.
     * @param to Recipient address
     * @param amount Token amount to transfer
     * @return bool Always returns true on success
     */
    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    /**
     * @notice Approve another address to spend tokens on your behalf.
     * @param spender Address authorized to spend tokens
     * @param amount Maximum amount the spender can transfer
     * @return bool Always returns true on success
     */
    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    /**
     * @notice Transfer tokens from one address to another using allowance.
     * @param from Token owner address
     * @param to Recipient address
     * @param amount Token amount to transfer
     * @return bool Always returns true on success
     */
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 currentAllowance = allowance[from][msg.sender];
        if (currentAllowance != type(uint256).max) {
            require(currentAllowance >= amount, "Insufficient allowance");
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
        require(isVerifiedHuman[msg.sender], "Not verified human");
        require(
            lastClaimTime[msg.sender] == 0 || block.timestamp >= lastClaimTime[msg.sender] + CLAIM_INTERVAL,
            "Already claimed today"
        );
        
        lastClaimTime[msg.sender] = block.timestamp;
        
        // Base UBI: mint new G$
        uint256 baseAmount = dailyUBIAmount;
        _mint(msg.sender, baseAmount);
        
        // Pool UBI: distribute share of fee pool
        uint256 poolShare = 0;
        if (ubiPool > 0 && totalVerifiedHumans > 0) {
            poolShare = ubiPool / totalVerifiedHumans;
            if (poolShare > 0) {
                ubiPool -= poolShare;
                _transfer(address(this), msg.sender, poolShare);
            }
        }
        
        emit UBIClaimed(msg.sender, baseAmount + poolShare, block.timestamp);
    }
    
    /**
     * @notice Fund the UBI pool. Called by dApps sending their UBI fee share.
     * @param amount Amount of G$ to transfer to the UBI pool
     */
    function fundUBIPool(uint256 amount) external {
        _transfer(msg.sender, address(this), amount);
        ubiPool += amount;
        emit UBIPoolFunded(msg.sender, amount);
    }
    
    /**
     * @notice Calculate the UBI fee for a given amount (used by dApps).
     * @param amount The base amount to calculate the fee on
     * @return uint256 The UBI fee amount (10% of the input amount)
     */
    function calculateUBIFee(uint256 amount) external pure returns (uint256) {
        return (amount * UBI_FEE_BPS) / 10000;
    }
    
    // ============ Identity ============
    
    /**
     * @notice Verify or unverify a human for UBI eligibility.
     * @param human Address to update verification status
     * @param status True to verify, false to unverify
     */
    function verifyHuman(address human, bool status) external onlyIdentityOracle {
        if (status && !isVerifiedHuman[human]) {
            totalVerifiedHumans++;
        } else if (!status && isVerifiedHuman[human]) {
            totalVerifiedHumans--;
        }
        isVerifiedHuman[human] = status;
        emit HumanVerified(human, status);
    }

    /**
     * @notice Batch verify multiple humans (for migration from Celo).
     * @param humans Array of addresses to verify
     */
    function batchVerifyHumans(address[] calldata humans) external onlyIdentityOracle {
        for (uint256 i = 0; i < humans.length; i++) {
            if (!isVerifiedHuman[humans[i]]) {
                isVerifiedHuman[humans[i]] = true;
                totalVerifiedHumans++;
                emit HumanVerified(humans[i], true);
            }
        }
    }
    
    // ============ Governance ============
    
    /**
     * @notice Update the daily UBI amount per verified human.
     * @param amount New daily UBI amount in G$ (with 18 decimals)
     */
    function setDailyUBIAmount(uint256 amount) external onlyAdmin {
        dailyUBIAmount = amount;
    }

    /**
     * @notice Update the identity oracle address.
     * @param _oracle New identity oracle address
     */
    function setIdentityOracle(address _oracle) external onlyAdmin {
        identityOracle = _oracle;
    }

    /**
     * @notice Transfer admin privileges to a new address.
     * @param _admin New admin address
     */
    function setAdmin(address _admin) external onlyAdmin {
        admin = _admin;
    }

    /**
     * @notice Authorize or deauthorize a minter contract.
     * @param minter Address of the minter contract
     * @param authorized True to authorize, false to deauthorize
     */
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
     * @param to Address to receive the minted tokens
     * @param amount Amount of tokens to mint
     */
    function mint(address to, uint256 amount) external onlyMinter {
        _mint(to, amount);
    }
    
    // ============ Internal ============
    
    function _transfer(address from, address to, uint256 amount) internal {
        require(balanceOf[from] >= amount, "Insufficient balance");
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
