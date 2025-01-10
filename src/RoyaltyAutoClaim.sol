// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {PackedUserOperation} from "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";
import {IAccount} from "@account-abstraction/contracts/interfaces/IAccount.sol";
import {ECDSA} from "solady/utils/ECDSA.sol";

contract UUPSProxy is ERC1967Proxy {
    constructor(address _implementation, bytes memory _data) payable ERC1967Proxy(_implementation, _data) {
        (bool success,) = _implementation.delegatecall(_data);
        require(success, "Initialization failed");
    }
}

contract RoyaltyAutoClaim is UUPSUpgradeable, OwnableUpgradeable, IAccount {
    using SafeERC20 for IERC20;

    error ZeroAddress();
    error Unauthorized(address caller);
    error ArrayLengthMismatch();
    error EmptyTitle();
    error AlreadyRegistered();
    error InvalidToken();
    error InvalidRoyaltyLevel();
    error NotEnoughReviews();
    error AlreadyClaimed();
    error RenounceOwnershipDisabled();
    error SubmissionNotExist();
    error NotFromEntryPoint();
    error ForbiddenPaymaster();
    error ZeroRoyalty();

    uint8 public constant ROYALTY_LEVEL_20 = 20;
    uint8 public constant ROYALTY_LEVEL_40 = 40;
    uint8 public constant ROYALTY_LEVEL_60 = 60;
    uint8 public constant ROYALTY_LEVEL_80 = 80;

    address public admin;
    address public token; // 稿費幣種

    mapping(address => bool) public reviewers;

    struct Submission {
        address royaltyRecipient;
        uint8 reviewCount;
        uint16 totalRoyaltyLevel;
    }

    mapping(string => Submission) public submissions;
    mapping(string => bool) public isClaimed;

    constructor() {
        _disableInitializers();
    }

    function initialize(address _owner, address _admin, address _token, address[] memory _reviewers)
        public
        initializer
    {
        require(_owner != address(0), ZeroAddress());
        require(_admin != address(0), ZeroAddress());
        require(_token != address(0), ZeroAddress());

        __Ownable_init(_owner);
        admin = _admin;
        token = _token;
        for (uint256 i = 0; i < _reviewers.length; i++) {
            reviewers[_reviewers[i]] = true;
        }
    }

    // ================================ Modifier ================================

    modifier onlyOwnerOrEntryPoint() {
        require(msg.sender == owner() || msg.sender == entryPoint(), Unauthorized(msg.sender));
        _;
    }

    modifier onlyAdminOrEntryPoint() {
        require(msg.sender == admin || msg.sender == entryPoint(), Unauthorized(msg.sender));
        _;
    }

    modifier onlyReviewerOrEntryPoint() {
        require(reviewers[msg.sender] || msg.sender == entryPoint(), Unauthorized(msg.sender));
        _;
    }

    modifier onlyEntryPoint() virtual {
        if (msg.sender != entryPoint()) {
            revert NotFromEntryPoint();
        }
        _;
    }

    /// @dev Sends to the EntryPoint (i.e. `msg.sender`) the missing funds for this transaction.
    /// @param missingAccountFunds is the minimum value this modifier should send the EntryPoint, which MAY be zero, in case there is enough deposit, or the userOp has a paymaster.
    /// @notice Modified from https://github.com/erc7579/erc7579-implementation/blob/main/src/MSAAdvanced.sol
    modifier payPrefund(uint256 missingAccountFunds) {
        _;
        /// @solidity memory-safe-assembly
        assembly {
            if missingAccountFunds {
                // Ignore failure (it's EntryPoint's job to verify, not the account's).
                pop(call(gas(), caller(), missingAccountFunds, codesize(), 0x00, codesize(), 0x00))
            }
        }
    }

    // ================================ Owner ================================

    /**
     * @dev for upgradeToAndCall
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyOwnerOrEntryPoint {}

    function changeAdmin(address _admin) public onlyOwnerOrEntryPoint {
        require(_admin != address(0), ZeroAddress());
        admin = _admin;
    }

    function changeRoyaltyToken(address _token) public onlyOwnerOrEntryPoint {
        require(_token != address(0), ZeroAddress());
        require(IERC20(_token).totalSupply() >= 0, InvalidToken());
        token = _token;
    }

    function renounceOwnership() public pure override {
        revert RenounceOwnershipDisabled();
    }

    // ================================ Admin ================================

    function updateReviewers(address[] memory _reviewers, bool[] memory _status) public onlyAdminOrEntryPoint {
        require(_reviewers.length == _status.length, ArrayLengthMismatch());

        for (uint256 i = 0; i < _reviewers.length; i++) {
            reviewers[_reviewers[i]] = _status[i];
        }
    }

    function registerSubmission(string memory title, address royaltyRecipient) public onlyAdminOrEntryPoint {
        require(bytes(title).length > 0, EmptyTitle());
        require(royaltyRecipient != address(0), ZeroAddress());
        require(!isSubmissionExist(title), AlreadyRegistered());
        submissions[title].royaltyRecipient = royaltyRecipient;
    }

    function updateRoyaltyRecipient(string memory title, address newRoyaltyRecipient) public onlyAdminOrEntryPoint {
        require(isSubmissionExist(title), SubmissionNotExist());
        submissions[title].royaltyRecipient = newRoyaltyRecipient;
    }

    function revokeSubmission(string memory title) public onlyAdminOrEntryPoint {
        require(isSubmissionExist(title), SubmissionNotExist());
        delete submissions[title];
    }

    // ================================ Reviewer ================================

    function reviewSubmission(string memory title, uint16 royaltyLevel) public onlyReviewerOrEntryPoint {
        require(
            royaltyLevel == ROYALTY_LEVEL_20 || royaltyLevel == ROYALTY_LEVEL_40 || royaltyLevel == ROYALTY_LEVEL_60
                || royaltyLevel == ROYALTY_LEVEL_80,
            InvalidRoyaltyLevel()
        );
        submissions[title].reviewCount++;
        submissions[title].totalRoyaltyLevel += royaltyLevel;
    }

    // ================================ Submitter ================================

    // TODO: add ReentrancyGuard
    function claimRoyalty(string memory title) public {
        require(isSubmissionExist(title), SubmissionNotExist());
        require(!isClaimed[title], AlreadyClaimed());
        require(isSubmissionClaimable(title), NotEnoughReviews());
        uint256 amount = getRoyalty(title);
        require(amount > 0, ZeroRoyalty());

        isClaimed[title] = true;
        IERC20(token).safeTransfer(submissions[title].royaltyRecipient, amount);
    }

    // ================================ View ================================

    function isSubmissionExist(string memory title) public view returns (bool) {
        return submissions[title].royaltyRecipient != address(0);
    }

    function isSubmissionClaimable(string memory title) public view returns (bool) {
        if (!isSubmissionExist(title) || isClaimed[title]) {
            return false;
        }
        return submissions[title].reviewCount >= 2;
    }

    function getRoyalty(string memory title) public view returns (uint256 royalty) {
        if (!isSubmissionClaimable(title)) return 0;

        // TODO: add multiplier variable or just use 1e18?
        return (uint256(submissions[title].totalRoyaltyLevel) * 1e18) / submissions[title].reviewCount;
    }

    /**
     * @dev EntryPoint for v0.7
     */
    function entryPoint() public pure returns (address) {
        return 0x0000000071727De22E5E9d8BAf0edAc6f37da032;
    }

    // ================================ ERC-4337 ================================

    /**
     * @dev Ensure that signer has the appropriate permissions of Owner, Admin, or Reviewer.
     * @dev Forbid to use paymaster
     * TODO: 檢查手續費最多不能超過 X ETH（X 的值待定）
     */
    function validateUserOp(PackedUserOperation calldata userOp, bytes32 userOpHash, uint256 missingAccountFunds)
        external
        onlyEntryPoint
        payPrefund(missingAccountFunds)
        returns (uint256 validationData)
    {
        if (userOp.paymasterAndData.length > 0) {
            revert ForbiddenPaymaster();
        }

        bytes4 selector = bytes4(userOp.callData[0:4]);
        bytes32 ethHash = ECDSA.toEthSignedMessageHash(userOpHash);
        address signer = ECDSA.recover(ethHash, userOp.signature);

        if (
            // Owner
            selector == this.upgradeToAndCall.selector || selector == this.changeAdmin.selector
                || selector == this.changeRoyaltyToken.selector || selector == this.transferOwnership.selector
        ) {
            if (signer != owner()) {
                revert Unauthorized(signer);
            }
        } else if (
            // Admin
            selector == this.updateReviewers.selector || selector == this.registerSubmission.selector
                || selector == this.updateRoyaltyRecipient.selector || selector == this.revokeSubmission.selector
        ) {
            if (signer != admin) {
                revert Unauthorized(signer);
            }
            // Reviewer
        } else if (selector == this.reviewSubmission.selector) {
            if (!reviewers[signer]) {
                revert Unauthorized(signer);
            }
        }

        return 0;
    }
}
