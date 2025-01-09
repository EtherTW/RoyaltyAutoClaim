// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract UUPSProxy is ERC1967Proxy {
    constructor(address _implementation, bytes memory _data) payable ERC1967Proxy(_implementation, _data) {
        (bool success,) = _implementation.delegatecall(_data);
        require(success, "Initialization failed");
    }
}

contract RoyaltyAutoClaim is UUPSUpgradeable, OwnableUpgradeable {
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
    error NotClaimable();

    uint256 public constant ROYALTY_LEVEL_20 = 20;
    uint256 public constant ROYALTY_LEVEL_40 = 40;
    uint256 public constant ROYALTY_LEVEL_60 = 60;
    uint256 public constant ROYALTY_LEVEL_80 = 80;

    address public admin;
    address public token; // 稿費幣種

    mapping(address => bool) public reviewers;

    struct Submission {
        address royaltyRecipient;
        uint256 reviewCount;
        uint256 totalRoyaltyLevel;
    }

    mapping(string => Submission) public submissions;
    mapping(string => bool) public claimed;

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

    // TODO: use AccessControl?
    modifier onlyAdmin() {
        require(msg.sender == admin, Unauthorized(msg.sender));
        _;
    }

    // TODO: use AccessControl?
    modifier onlyReviewer() {
        require(reviewers[msg.sender], Unauthorized(msg.sender));
        _;
    }

    // ================================ Owner ================================

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function changeAdmin(address _admin) public onlyOwner {
        require(_admin != address(0), ZeroAddress());
        admin = _admin;
    }

    function changeRoyaltyToken(address _token) public onlyOwner {
        require(_token != address(0), ZeroAddress());
        require(IERC20(_token).totalSupply() >= 0, InvalidToken());
        token = _token;
    }

    function renounceOwnership() public pure override {
        revert RenounceOwnershipDisabled();
    }

    // ================================ Admin ================================

    function updateReviewers(address[] memory _reviewers, bool[] memory _status) public onlyAdmin {
        require(_reviewers.length == _status.length, ArrayLengthMismatch());

        for (uint256 i = 0; i < _reviewers.length; i++) {
            reviewers[_reviewers[i]] = _status[i];
        }
    }

    function registerSubmission(string memory title, address royaltyRecipient) public onlyAdmin {
        require(bytes(title).length > 0, EmptyTitle());
        require(royaltyRecipient != address(0), ZeroAddress());
        require(!isSubmissionExist(title), AlreadyRegistered());
        submissions[title].royaltyRecipient = royaltyRecipient;
    }

    function updateRoyaltyRecipient(string memory title, address newRoyaltyRecipient) public onlyAdmin {
        require(isSubmissionExist(title), SubmissionNotExist());
        submissions[title].royaltyRecipient = newRoyaltyRecipient;
    }

    function revokeSubmission(string memory title) public onlyAdmin {
        require(isSubmissionExist(title), SubmissionNotExist());
        delete submissions[title];
    }

    // ================================ Reviewer ================================

    function reviewSubmission(string memory title, uint256 royaltyLevel) public onlyReviewer {
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
    // TODO: use safeTransfer
    function claimRoyalty(string memory title) public {
        require(isSubmissionExist(title), SubmissionNotExist());
        require(isSubmissionClaimable(title), NotClaimable());
        uint256 royaltyAmount = getRoyalty(title);
        claimed[title] = true;
        IERC20(token).safeTransfer(submissions[title].royaltyRecipient, royaltyAmount);
    }

    // ================================ View ================================

    function isSubmissionExist(string memory title) public view returns (bool) {
        return submissions[title].royaltyRecipient != address(0);
    }

    function isSubmissionClaimable(string memory title) public view returns (bool) {
        if (!isSubmissionExist(title) || claimed[title]) {
            return false;
        }
        return submissions[title].reviewCount >= 2 && getRoyalty(title) > 0;
    }

    function getRoyalty(string memory title) public view returns (uint256 royalty) {
        require(isSubmissionExist(title), SubmissionNotExist());
        Submission memory submission = submissions[title];
        if (submission.reviewCount == 0) {
            return 0;
        }
        // TODO: add multiplier variable or just use 1e18?
        return (submission.totalRoyaltyLevel * 1e18) / submission.reviewCount;
    }

    // others
    // Add function to recover accidentally sent tokens
}
