import { Interface } from 'ethers'

export const RAC_V1_INTERFACE = new Interface([
	// Owner functions
	'function transferOwnership(address newOwner)',
	'function changeAdmin(address _admin)',
	'function changeRoyaltyToken(address _token)',
	'function emergencyWithdraw(address _token, uint256 _amount)',

	// Admin functions
	'function updateReviewers(address[] _reviewers, bool[] _status)',
	'function registerSubmission(string title, address royaltyRecipient)',
	'function updateRoyaltyRecipient(string title, address newRoyaltyRecipient)',
	'function revokeSubmission(string title)',

	// Reviewer functions
	'function reviewSubmission(string title, uint16 royaltyLevel)',

	// Recipient functions
	'function claimRoyalty(string title)',

	// View functions
	'function admin() view returns (address)',
	'function token() view returns (address)',
	'function submissions(string title) view returns (tuple(address royaltyRecipient, uint16 totalRoyaltyLevel, uint8 status, uint8 reviewCount))',
	'function isReviewer(address reviewer) view returns (bool)',
	'function hasReviewed(string title, address reviewer) view returns (bool)',
	'function isSubmissionClaimable(string title) view returns (bool)',
	'function getRoyalty(string title) view returns (uint256 royalty)',
	'function entryPoint() pure returns (address)',

	// Events
	'event AdminChanged(address indexed oldAdmin, address indexed newAdmin)',
	'event RoyaltyTokenChanged(address indexed oldToken, address indexed newToken)',
	'event EmergencyWithdraw(address indexed token, uint256 amount)',
	'event ReviewerStatusUpdated(address indexed reviewer, bool status)',
	'event SubmissionRegistered(string indexed titleHash, address indexed royaltyRecipient, string title)',
	'event SubmissionRoyaltyRecipientUpdated(string indexed titleHash, address indexed oldRecipient, address indexed newRecipient, string title)',
	'event SubmissionRevoked(string indexed titleHash, string title)',
	'event SubmissionReviewed(string indexed titleHash, address indexed reviewer, uint16 royaltyLevel, string title)',
	'event RoyaltyClaimed(address indexed recipient, uint256 amount, string title)',

	// Errors
	'error ZeroAddress()',
	'error Unauthorized(address caller)',
	'error InvalidArrayLength()',
	'error EmptyTitle()',
	'error InvalidRoyaltyLevel(uint16 royaltyLevel)',
	'error SubmissionNotClaimable()',
	'error RenounceOwnershipDisabled()',
	'error AlreadyRegistered()',
	'error SubmissionStatusNotRegistered()',
	'error NotFromEntryPoint()',
	'error ForbiddenPaymaster()',
	'error UnsupportSelector(bytes4 selector)',
	'error AlreadyReviewed()',
	'error InvalidSignatureLength()',
	'error SameAddress()',
	'error SameStatus()',
	'error ZeroAmount()',
])
