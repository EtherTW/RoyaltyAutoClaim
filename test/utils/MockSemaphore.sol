// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ISemaphore} from "../../lib/semaphore/packages/contracts/contracts/interfaces/ISemaphore.sol";
import {ISemaphoreGroups} from "../../lib/semaphore/packages/contracts/contracts/interfaces/ISemaphoreGroups.sol";

/// @title MockSemaphore
/// @notice Mock implementation of ISemaphore interface for testing
contract MockSemaphore is ISemaphore, ISemaphoreGroups {
    uint256 private _groupCounter;
    mapping(uint256 => address) public groupAdmins;
    mapping(uint256 => address) public pendingGroupAdmins;
    mapping(uint256 => mapping(uint256 => bool)) public groupMembers; // groupId => identityCommitment => exists
    mapping(uint256 => uint256) public groupMerkleTreeRoots;
    mapping(uint256 => uint256) public groupMerkleTreeDepths;
    mapping(uint256 => uint256) public groupMerkleTreeSizes;
    mapping(uint256 => uint256[]) public groupMembersList; // groupId => list of identityCommitments

    bool public mockVerifyResult = true; // Allow controlling verification result

    /// @dev Sets the mock verification result for testing
    /// @param result The verification result to return
    function setMockVerifyResult(bool result) external {
        mockVerifyResult = result;
    }

    /// @dev Returns the current value of the group counter
    function groupCounter() external view returns (uint256) {
        return _groupCounter;
    }

    /// @dev Creates a group without an admin
    function createGroup() external returns (uint256) {
        return _createGroup(address(0), 1 hours);
    }

    /// @dev Creates a group with an admin
    function createGroup(address admin) external returns (uint256) {
        return _createGroup(admin, 1 hours);
    }

    /// @dev Creates a group with an admin and custom Merkle tree duration
    function createGroup(address admin, uint256 merkleTreeDuration) external returns (uint256) {
        return _createGroup(admin, merkleTreeDuration);
    }

    /// @dev Internal function to create a group
    function _createGroup(
        address admin,
        uint256 /* merkleTreeDuration */
    )
        internal
        returns (uint256)
    {
        uint256 groupId = _groupCounter++;
        groupAdmins[groupId] = admin;
        groupMerkleTreeRoots[groupId] = uint256(keccak256("mock_root"));
        groupMerkleTreeDepths[groupId] = 20;
        groupMerkleTreeSizes[groupId] = 0;

        emit GroupCreated(groupId);
        if (admin != address(0)) {
            emit GroupAdminUpdated(groupId, address(0), admin);
        }

        return groupId;
    }

    /// @dev Updates the group admin
    function updateGroupAdmin(uint256 groupId, address newAdmin) external {
        address oldAdmin = groupAdmins[groupId];
        pendingGroupAdmins[groupId] = newAdmin;
        emit GroupAdminPending(groupId, oldAdmin, newAdmin);
    }

    /// @dev Accepts the group admin role
    function acceptGroupAdmin(uint256 groupId) external {
        require(pendingGroupAdmins[groupId] == msg.sender, "Not pending admin");
        address oldAdmin = groupAdmins[groupId];
        groupAdmins[groupId] = msg.sender;
        delete pendingGroupAdmins[groupId];
        emit GroupAdminUpdated(groupId, oldAdmin, msg.sender);
    }

    /// @dev Updates the group Merkle tree duration (no-op in mock)
    function updateGroupMerkleTreeDuration(uint256 groupId, uint256 newMerkleTreeDuration) external {
        emit GroupMerkleTreeDurationUpdated(groupId, 1 hours, newMerkleTreeDuration);
    }

    /// @dev Adds a member to the group
    function addMember(uint256 groupId, uint256 identityCommitment) external {
        require(!groupMembers[groupId][identityCommitment], "Member already exists");
        groupMembers[groupId][identityCommitment] = true;
        uint256 index = groupMembersList[groupId].length;
        groupMembersList[groupId].push(identityCommitment);
        groupMerkleTreeSizes[groupId]++;

        // Update mock root
        groupMerkleTreeRoots[groupId] =
            uint256(keccak256(abi.encodePacked(groupMerkleTreeRoots[groupId], identityCommitment)));

        emit MemberAdded(groupId, index, identityCommitment, groupMerkleTreeRoots[groupId]);
    }

    /// @dev Adds multiple members to the group
    function addMembers(uint256 groupId, uint256[] calldata identityCommitments) external {
        uint256 startIndex = groupMembersList[groupId].length;

        for (uint256 i = 0; i < identityCommitments.length; i++) {
            require(!groupMembers[groupId][identityCommitments[i]], "Member already exists");
            groupMembers[groupId][identityCommitments[i]] = true;
            groupMembersList[groupId].push(identityCommitments[i]);
            groupMerkleTreeSizes[groupId]++;

            // Update mock root
            groupMerkleTreeRoots[groupId] =
                uint256(keccak256(abi.encodePacked(groupMerkleTreeRoots[groupId], identityCommitments[i])));
        }

        emit MembersAdded(groupId, startIndex, identityCommitments, groupMerkleTreeRoots[groupId]);
    }

    /// @dev Updates a member in the group
    function updateMember(
        uint256 groupId,
        uint256 oldIdentityCommitment,
        uint256 newIdentityCommitment,
        uint256[] calldata /* merkleProofSiblings */
    ) external {
        require(groupMembers[groupId][oldIdentityCommitment], "Member does not exist");
        require(!groupMembers[groupId][newIdentityCommitment], "New member already exists");

        groupMembers[groupId][oldIdentityCommitment] = false;
        groupMembers[groupId][newIdentityCommitment] = true;

        // Update list
        uint256 index = indexOf(groupId, oldIdentityCommitment);
        groupMembersList[groupId][index] = newIdentityCommitment;

        // Update mock root
        groupMerkleTreeRoots[groupId] =
            uint256(keccak256(abi.encodePacked(groupMerkleTreeRoots[groupId], newIdentityCommitment)));

        emit MemberUpdated(groupId, index, oldIdentityCommitment, newIdentityCommitment, groupMerkleTreeRoots[groupId]);
    }

    /// @dev Removes a member from the group
    function removeMember(
        uint256 groupId,
        uint256 identityCommitment,
        uint256[] calldata /* merkleProofSiblings */
    )
        external
    {
        require(groupMembers[groupId][identityCommitment], "Member does not exist");

        groupMembers[groupId][identityCommitment] = false;
        groupMerkleTreeSizes[groupId]--;

        // Update mock root
        groupMerkleTreeRoots[groupId] = uint256(keccak256(abi.encodePacked(groupMerkleTreeRoots[groupId], "removed")));

        uint256 index = indexOf(groupId, identityCommitment);
        emit MemberRemoved(groupId, index, identityCommitment, groupMerkleTreeRoots[groupId]);
    }

    /// @dev Validates a Semaphore proof
    function validateProof(uint256 groupId, SemaphoreProof calldata proof) external {
        if (!mockVerifyResult) {
            revert Semaphore__InvalidProof();
        }

        emit ProofValidated(
            groupId,
            proof.merkleTreeDepth,
            proof.merkleTreeRoot,
            proof.nullifier,
            proof.message,
            proof.scope,
            proof.points
        );
    }

    /// @dev Verifies a Semaphore proof
    function verifyProof(
        uint256,
        /* groupId */
        SemaphoreProof calldata /* proof */
    )
        external
        view
        returns (bool)
    {
        return mockVerifyResult;
    }

    /// @dev Returns the group admin address
    function getGroupAdmin(uint256 groupId) external view returns (address) {
        return groupAdmins[groupId];
    }

    /// @dev Checks if a member exists in the group
    function hasMember(uint256 groupId, uint256 identityCommitment) external view returns (bool) {
        return groupMembers[groupId][identityCommitment];
    }

    /// @dev Returns the index of a member
    function indexOf(uint256 groupId, uint256 identityCommitment) public view returns (uint256) {
        uint256[] storage members = groupMembersList[groupId];
        for (uint256 i = 0; i < members.length; i++) {
            if (members[i] == identityCommitment) {
                return i;
            }
        }
        revert("Member not found");
    }

    /// @dev Returns the Merkle tree root
    function getMerkleTreeRoot(uint256 groupId) external view returns (uint256) {
        return groupMerkleTreeRoots[groupId];
    }

    /// @dev Returns the Merkle tree depth
    function getMerkleTreeDepth(uint256 groupId) external view returns (uint256) {
        return groupMerkleTreeDepths[groupId];
    }

    /// @dev Returns the Merkle tree size
    function getMerkleTreeSize(uint256 groupId) external view returns (uint256) {
        return groupMerkleTreeSizes[groupId];
    }
}
