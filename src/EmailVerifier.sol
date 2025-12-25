// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IDKIMRegistry} from "@zk-email/contracts/interfaces/IDKIMRegistry.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {HonkVerifier} from "../circuits/title_hash/target/TitleHashVerifier.sol";
import {TitleHashVerifierLib} from "./TitleHashVerifierLib.sol";

interface IEmailVerifier {
    error ZeroValue();
    error InvalidDKIMPublicKey(bytes32 publicKeyHash);
    error EmailFromAddressMismatch(bytes32 expected, string actual);
    error TitleHashMismatch(string title, bytes32 titleHash);

    function verifyEmail(string calldata _title, TitleHashVerifierLib.EmailProof calldata _proof)
        external
        view
        returns (bool);
}

contract EmailVerifier is IEmailVerifier, HonkVerifier, Ownable {
    using TitleHashVerifierLib for TitleHashVerifierLib.EmailProof;

    string public constant DOMAIN = "gmail.com";
    bytes32 public immutable EMAIL_FROM_ADDRESS_HASH;

    IDKIMRegistry public dkimRegistry;

    /// @dev The reason this contract needs to have an owner is that
    /// UserOverrideableDKIMRegistry.isDKIMPublicKeyHashValid calls owner() on msg.sender.
    /// See https://vscode.blockscan.com/8453/0x0537487ff990df53b29bd3e4b4a4c5c80c17f958
    constructor(IDKIMRegistry _dkimRegistry, bytes32 _emailFromAddressHash) Ownable(msg.sender) {
        require(address(_dkimRegistry) != address(0), ZeroValue());
        require(_emailFromAddressHash != bytes32(0), ZeroValue());

        dkimRegistry = _dkimRegistry;
        EMAIL_FROM_ADDRESS_HASH = _emailFromAddressHash;
    }

    function verifyEmail(string calldata _title, TitleHashVerifierLib.EmailProof calldata _proof)
        external
        view
        returns (bool)
    {
        // Verify DKIM public key
        if (!dkimRegistry.isDKIMPublicKeyHashValid(DOMAIN, _proof.pubkeyHash())) {
            revert InvalidDKIMPublicKey(_proof.pubkeyHash());
        }

        // Verify email from address
        if (EMAIL_FROM_ADDRESS_HASH != keccak256(abi.encodePacked(_proof.fromAddress()))) {
            revert EmailFromAddressMismatch(EMAIL_FROM_ADDRESS_HASH, _proof.fromAddress());
        }

        // Verify title hash
        if (keccak256(abi.encodePacked(_title)) != _proof.titleHash()) {
            revert TitleHashMismatch(_title, _proof.titleHash());
        }

        // Verify proof: return false if verification fails instead of reverting
        try this.verify(_proof.proof, _proof.publicInputs) returns (bool success) {
            return success;
        } catch {
            return false;
        }
    }
}
