// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {RoyaltyAutoClaim} from "../src/RoyaltyAutoClaim.sol";
import {RoyaltyAutoClaimProxy} from "../src/RoyaltyAutoClaimProxy.sol";
import {EmailVerifier} from "../src/EmailVerifier.sol";
import {IDKIMRegistry} from "@zk-email/contracts/interfaces/IDKIMRegistry.sol";
import {ISemaphore} from "@semaphore/interfaces/ISemaphore.sol";
// import for compiling the contract used for frontend type generation
import {ISemaphoreGroups} from "@semaphore/interfaces/ISemaphoreGroups.sol";

/*

forge script script/deployRoyaltyAutoClaim.s.sol --rpc-url https://sepolia.base.org --broadcast --verify

*/

contract DeployRoyaltyAutoClaimScript is Script {
    function run() public {
        address deployer = vm.rememberKey(vm.envUint("PRIVATE_KEY"));
        console.log("Deployer", deployer);

        string memory json = vm.readFile(string.concat(vm.projectRoot(), "/deploy.json"));
        address owner = vm.parseJsonAddress(json, ".RoyaltyAutoClaim.owner");
        address admin = vm.parseJsonAddress(json, ".RoyaltyAutoClaim.admin");
        address token = vm.parseJsonAddress(json, ".RoyaltyAutoClaim.token");
        address dkimRegistryAddr = vm.parseJsonAddress(json, ".RoyaltyAutoClaim.dkimRegistry");
        string memory emailFromAddress = vm.parseJsonString(json, ".RoyaltyAutoClaim.emailFromAddress");
        address semaphoreAddr = vm.parseJsonAddress(json, ".RoyaltyAutoClaim.semaphore");

        vm.startBroadcast(deployer);

        // ZK Email
        IDKIMRegistry dkimRegistry = IDKIMRegistry(dkimRegistryAddr);
        EmailVerifier emailVerifier = new EmailVerifier(dkimRegistry, keccak256(abi.encodePacked(emailFromAddress)));

        // Semaphore
        ISemaphore semaphore = ISemaphore(semaphoreAddr);

        // RoyaltyAutoClaim
        RoyaltyAutoClaim royaltyAutoClaim = new RoyaltyAutoClaim();
        RoyaltyAutoClaimProxy proxy = new RoyaltyAutoClaimProxy(
            address(royaltyAutoClaim),
            abi.encodeCall(RoyaltyAutoClaim.initialize, (owner, admin, token, emailVerifier, semaphore))
        );

        console.log("RoyaltyAutoClaim implementation at:", address(royaltyAutoClaim));
        console.log("RoyaltyAutoClaim proxy at:", address(proxy));

        vm.stopBroadcast();
    }
}
