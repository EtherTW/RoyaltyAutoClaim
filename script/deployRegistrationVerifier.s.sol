// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {Script, console} from "forge-std/Script.sol";
import "@zk-email/contracts/interfaces/IDKIMRegistry.sol";
import "@zk-email/contracts/DKIMRegistry.sol";
import {RegistrationVerifier} from "../src/RegistrationVerifier.sol";
import {Verifier} from "../circuits/verifier.sol";

/*

forge script script/deployRegistrationVerifier.s.sol --rpc-url https://sepolia.base.org --broadcast --verify

zkemail deployed contracts: https://docs.zk.email/account-recovery/deployed-contracts

*/

contract DeployRegistrationVerifierScript is Script {
    function run() public {
        address deployer = vm.rememberKey(vm.envUint("PRIVATE_KEY"));
        console.log("Deployer", deployer);

        address dkimRegistryAddr = 0x3D3935B3C030893f118a84C92C66dF1B9E4169d6;

        vm.startBroadcast(deployer);

        IDKIMRegistry dkimRegistry = IDKIMRegistry(dkimRegistryAddr);
        Verifier verifier = new Verifier();
        RegistrationVerifier registrationVerifier = new RegistrationVerifier(dkimRegistry, verifier, "johnson86tw");

        vm.stopBroadcast();

        console.log("Deployed DKIMRegistry at", address(dkimRegistry));
        console.log("Deployed Verifier at", address(verifier));
        console.log("Deployed RegistrationVerifier at", address(registrationVerifier));
    }
}
