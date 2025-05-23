/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */
import type {
  BaseContract,
  BigNumberish,
  BytesLike,
  FunctionFragment,
  Result,
  Interface,
  EventFragment,
  AddressLike,
  ContractRunner,
  ContractMethod,
  Listener,
} from "ethers";
import type {
  TypedContractEvent,
  TypedDeferredTopicFilter,
  TypedEventLog,
  TypedLogDescription,
  TypedListener,
  TypedContractMethod,
} from "../common";

export type PackedUserOperationStruct = {
  sender: AddressLike;
  nonce: BigNumberish;
  initCode: BytesLike;
  callData: BytesLike;
  accountGasLimits: BytesLike;
  preVerificationGas: BigNumberish;
  gasFees: BytesLike;
  paymasterAndData: BytesLike;
  signature: BytesLike;
};

export type PackedUserOperationStructOutput = [
  sender: string,
  nonce: bigint,
  initCode: string,
  callData: string,
  accountGasLimits: string,
  preVerificationGas: bigint,
  gasFees: string,
  paymasterAndData: string,
  signature: string
] & {
  sender: string;
  nonce: bigint;
  initCode: string;
  callData: string;
  accountGasLimits: string;
  preVerificationGas: bigint;
  gasFees: string;
  paymasterAndData: string;
  signature: string;
};

export declare namespace IRoyaltyAutoClaim {
  export type SubmissionStruct = {
    royaltyRecipient: AddressLike;
    totalRoyaltyLevel: BigNumberish;
    status: BigNumberish;
    reviewCount: BigNumberish;
  };

  export type SubmissionStructOutput = [
    royaltyRecipient: string,
    totalRoyaltyLevel: bigint,
    status: bigint,
    reviewCount: bigint
  ] & {
    royaltyRecipient: string;
    totalRoyaltyLevel: bigint;
    status: bigint;
    reviewCount: bigint;
  };
}

export interface RoyaltyAutoClaimInterface extends Interface {
  getFunction(
    nameOrSignature:
      | "NATIVE_TOKEN"
      | "ROYALTY_LEVEL_20"
      | "ROYALTY_LEVEL_40"
      | "ROYALTY_LEVEL_60"
      | "ROYALTY_LEVEL_80"
      | "SIG_VALIDATION_FAILED"
      | "UPGRADE_INTERFACE_VERSION"
      | "admin"
      | "changeAdmin"
      | "changeRoyaltyToken"
      | "claimRoyalty"
      | "emergencyWithdraw"
      | "entryPoint"
      | "getRoyalty"
      | "hasReviewed"
      | "initialize"
      | "isRecipient"
      | "isReviewer"
      | "isSubmissionClaimable"
      | "owner"
      | "proxiableUUID"
      | "registerSubmission"
      | "renounceOwnership"
      | "reviewSubmission"
      | "revokeSubmission"
      | "submissions"
      | "token"
      | "transferOwnership"
      | "updateReviewers"
      | "updateRoyaltyRecipient"
      | "upgradeToAndCall"
      | "validateUserOp"
  ): FunctionFragment;

  getEvent(
    nameOrSignatureOrTopic:
      | "AdminChanged"
      | "EmergencyWithdraw"
      | "Initialized"
      | "OwnershipTransferred"
      | "ReviewerStatusUpdated"
      | "RoyaltyClaimed"
      | "RoyaltyTokenChanged"
      | "SubmissionRegistered"
      | "SubmissionReviewed"
      | "SubmissionRevoked"
      | "SubmissionRoyaltyRecipientUpdated"
      | "Upgraded"
  ): EventFragment;

  encodeFunctionData(
    functionFragment: "NATIVE_TOKEN",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "ROYALTY_LEVEL_20",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "ROYALTY_LEVEL_40",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "ROYALTY_LEVEL_60",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "ROYALTY_LEVEL_80",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "SIG_VALIDATION_FAILED",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "UPGRADE_INTERFACE_VERSION",
    values?: undefined
  ): string;
  encodeFunctionData(functionFragment: "admin", values?: undefined): string;
  encodeFunctionData(
    functionFragment: "changeAdmin",
    values: [AddressLike]
  ): string;
  encodeFunctionData(
    functionFragment: "changeRoyaltyToken",
    values: [AddressLike]
  ): string;
  encodeFunctionData(
    functionFragment: "claimRoyalty",
    values: [string]
  ): string;
  encodeFunctionData(
    functionFragment: "emergencyWithdraw",
    values: [AddressLike, BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "entryPoint",
    values?: undefined
  ): string;
  encodeFunctionData(functionFragment: "getRoyalty", values: [string]): string;
  encodeFunctionData(
    functionFragment: "hasReviewed",
    values: [string, AddressLike]
  ): string;
  encodeFunctionData(
    functionFragment: "initialize",
    values: [AddressLike, AddressLike, AddressLike, AddressLike[]]
  ): string;
  encodeFunctionData(
    functionFragment: "isRecipient",
    values: [string, AddressLike]
  ): string;
  encodeFunctionData(
    functionFragment: "isReviewer",
    values: [AddressLike]
  ): string;
  encodeFunctionData(
    functionFragment: "isSubmissionClaimable",
    values: [string]
  ): string;
  encodeFunctionData(functionFragment: "owner", values?: undefined): string;
  encodeFunctionData(
    functionFragment: "proxiableUUID",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "registerSubmission",
    values: [string, AddressLike]
  ): string;
  encodeFunctionData(
    functionFragment: "renounceOwnership",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "reviewSubmission",
    values: [string, BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "revokeSubmission",
    values: [string]
  ): string;
  encodeFunctionData(functionFragment: "submissions", values: [string]): string;
  encodeFunctionData(functionFragment: "token", values?: undefined): string;
  encodeFunctionData(
    functionFragment: "transferOwnership",
    values: [AddressLike]
  ): string;
  encodeFunctionData(
    functionFragment: "updateReviewers",
    values: [AddressLike[], boolean[]]
  ): string;
  encodeFunctionData(
    functionFragment: "updateRoyaltyRecipient",
    values: [string, AddressLike]
  ): string;
  encodeFunctionData(
    functionFragment: "upgradeToAndCall",
    values: [AddressLike, BytesLike]
  ): string;
  encodeFunctionData(
    functionFragment: "validateUserOp",
    values: [PackedUserOperationStruct, BytesLike, BigNumberish]
  ): string;

  decodeFunctionResult(
    functionFragment: "NATIVE_TOKEN",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "ROYALTY_LEVEL_20",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "ROYALTY_LEVEL_40",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "ROYALTY_LEVEL_60",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "ROYALTY_LEVEL_80",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "SIG_VALIDATION_FAILED",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "UPGRADE_INTERFACE_VERSION",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "admin", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "changeAdmin",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "changeRoyaltyToken",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "claimRoyalty",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "emergencyWithdraw",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "entryPoint", data: BytesLike): Result;
  decodeFunctionResult(functionFragment: "getRoyalty", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "hasReviewed",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "initialize", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "isRecipient",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "isReviewer", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "isSubmissionClaimable",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "owner", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "proxiableUUID",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "registerSubmission",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "renounceOwnership",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "reviewSubmission",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "revokeSubmission",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "submissions",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "token", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "transferOwnership",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "updateReviewers",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "updateRoyaltyRecipient",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "upgradeToAndCall",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "validateUserOp",
    data: BytesLike
  ): Result;
}

export namespace AdminChangedEvent {
  export type InputTuple = [oldAdmin: AddressLike, newAdmin: AddressLike];
  export type OutputTuple = [oldAdmin: string, newAdmin: string];
  export interface OutputObject {
    oldAdmin: string;
    newAdmin: string;
  }
  export type Event = TypedContractEvent<InputTuple, OutputTuple, OutputObject>;
  export type Filter = TypedDeferredTopicFilter<Event>;
  export type Log = TypedEventLog<Event>;
  export type LogDescription = TypedLogDescription<Event>;
}

export namespace EmergencyWithdrawEvent {
  export type InputTuple = [token: AddressLike, amount: BigNumberish];
  export type OutputTuple = [token: string, amount: bigint];
  export interface OutputObject {
    token: string;
    amount: bigint;
  }
  export type Event = TypedContractEvent<InputTuple, OutputTuple, OutputObject>;
  export type Filter = TypedDeferredTopicFilter<Event>;
  export type Log = TypedEventLog<Event>;
  export type LogDescription = TypedLogDescription<Event>;
}

export namespace InitializedEvent {
  export type InputTuple = [version: BigNumberish];
  export type OutputTuple = [version: bigint];
  export interface OutputObject {
    version: bigint;
  }
  export type Event = TypedContractEvent<InputTuple, OutputTuple, OutputObject>;
  export type Filter = TypedDeferredTopicFilter<Event>;
  export type Log = TypedEventLog<Event>;
  export type LogDescription = TypedLogDescription<Event>;
}

export namespace OwnershipTransferredEvent {
  export type InputTuple = [previousOwner: AddressLike, newOwner: AddressLike];
  export type OutputTuple = [previousOwner: string, newOwner: string];
  export interface OutputObject {
    previousOwner: string;
    newOwner: string;
  }
  export type Event = TypedContractEvent<InputTuple, OutputTuple, OutputObject>;
  export type Filter = TypedDeferredTopicFilter<Event>;
  export type Log = TypedEventLog<Event>;
  export type LogDescription = TypedLogDescription<Event>;
}

export namespace ReviewerStatusUpdatedEvent {
  export type InputTuple = [reviewer: AddressLike, status: boolean];
  export type OutputTuple = [reviewer: string, status: boolean];
  export interface OutputObject {
    reviewer: string;
    status: boolean;
  }
  export type Event = TypedContractEvent<InputTuple, OutputTuple, OutputObject>;
  export type Filter = TypedDeferredTopicFilter<Event>;
  export type Log = TypedEventLog<Event>;
  export type LogDescription = TypedLogDescription<Event>;
}

export namespace RoyaltyClaimedEvent {
  export type InputTuple = [
    recipient: AddressLike,
    amount: BigNumberish,
    title: string
  ];
  export type OutputTuple = [recipient: string, amount: bigint, title: string];
  export interface OutputObject {
    recipient: string;
    amount: bigint;
    title: string;
  }
  export type Event = TypedContractEvent<InputTuple, OutputTuple, OutputObject>;
  export type Filter = TypedDeferredTopicFilter<Event>;
  export type Log = TypedEventLog<Event>;
  export type LogDescription = TypedLogDescription<Event>;
}

export namespace RoyaltyTokenChangedEvent {
  export type InputTuple = [oldToken: AddressLike, newToken: AddressLike];
  export type OutputTuple = [oldToken: string, newToken: string];
  export interface OutputObject {
    oldToken: string;
    newToken: string;
  }
  export type Event = TypedContractEvent<InputTuple, OutputTuple, OutputObject>;
  export type Filter = TypedDeferredTopicFilter<Event>;
  export type Log = TypedEventLog<Event>;
  export type LogDescription = TypedLogDescription<Event>;
}

export namespace SubmissionRegisteredEvent {
  export type InputTuple = [
    titleHash: string,
    royaltyRecipient: AddressLike,
    title: string
  ];
  export type OutputTuple = [
    titleHash: string,
    royaltyRecipient: string,
    title: string
  ];
  export interface OutputObject {
    titleHash: string;
    royaltyRecipient: string;
    title: string;
  }
  export type Event = TypedContractEvent<InputTuple, OutputTuple, OutputObject>;
  export type Filter = TypedDeferredTopicFilter<Event>;
  export type Log = TypedEventLog<Event>;
  export type LogDescription = TypedLogDescription<Event>;
}

export namespace SubmissionReviewedEvent {
  export type InputTuple = [
    titleHash: string,
    reviewer: AddressLike,
    royaltyLevel: BigNumberish,
    title: string
  ];
  export type OutputTuple = [
    titleHash: string,
    reviewer: string,
    royaltyLevel: bigint,
    title: string
  ];
  export interface OutputObject {
    titleHash: string;
    reviewer: string;
    royaltyLevel: bigint;
    title: string;
  }
  export type Event = TypedContractEvent<InputTuple, OutputTuple, OutputObject>;
  export type Filter = TypedDeferredTopicFilter<Event>;
  export type Log = TypedEventLog<Event>;
  export type LogDescription = TypedLogDescription<Event>;
}

export namespace SubmissionRevokedEvent {
  export type InputTuple = [titleHash: string, title: string];
  export type OutputTuple = [titleHash: string, title: string];
  export interface OutputObject {
    titleHash: string;
    title: string;
  }
  export type Event = TypedContractEvent<InputTuple, OutputTuple, OutputObject>;
  export type Filter = TypedDeferredTopicFilter<Event>;
  export type Log = TypedEventLog<Event>;
  export type LogDescription = TypedLogDescription<Event>;
}

export namespace SubmissionRoyaltyRecipientUpdatedEvent {
  export type InputTuple = [
    titleHash: string,
    oldRecipient: AddressLike,
    newRecipient: AddressLike,
    title: string
  ];
  export type OutputTuple = [
    titleHash: string,
    oldRecipient: string,
    newRecipient: string,
    title: string
  ];
  export interface OutputObject {
    titleHash: string;
    oldRecipient: string;
    newRecipient: string;
    title: string;
  }
  export type Event = TypedContractEvent<InputTuple, OutputTuple, OutputObject>;
  export type Filter = TypedDeferredTopicFilter<Event>;
  export type Log = TypedEventLog<Event>;
  export type LogDescription = TypedLogDescription<Event>;
}

export namespace UpgradedEvent {
  export type InputTuple = [implementation: AddressLike];
  export type OutputTuple = [implementation: string];
  export interface OutputObject {
    implementation: string;
  }
  export type Event = TypedContractEvent<InputTuple, OutputTuple, OutputObject>;
  export type Filter = TypedDeferredTopicFilter<Event>;
  export type Log = TypedEventLog<Event>;
  export type LogDescription = TypedLogDescription<Event>;
}

export interface RoyaltyAutoClaim extends BaseContract {
  connect(runner?: ContractRunner | null): RoyaltyAutoClaim;
  waitForDeployment(): Promise<this>;

  interface: RoyaltyAutoClaimInterface;

  queryFilter<TCEvent extends TypedContractEvent>(
    event: TCEvent,
    fromBlockOrBlockhash?: string | number | undefined,
    toBlock?: string | number | undefined
  ): Promise<Array<TypedEventLog<TCEvent>>>;
  queryFilter<TCEvent extends TypedContractEvent>(
    filter: TypedDeferredTopicFilter<TCEvent>,
    fromBlockOrBlockhash?: string | number | undefined,
    toBlock?: string | number | undefined
  ): Promise<Array<TypedEventLog<TCEvent>>>;

  on<TCEvent extends TypedContractEvent>(
    event: TCEvent,
    listener: TypedListener<TCEvent>
  ): Promise<this>;
  on<TCEvent extends TypedContractEvent>(
    filter: TypedDeferredTopicFilter<TCEvent>,
    listener: TypedListener<TCEvent>
  ): Promise<this>;

  once<TCEvent extends TypedContractEvent>(
    event: TCEvent,
    listener: TypedListener<TCEvent>
  ): Promise<this>;
  once<TCEvent extends TypedContractEvent>(
    filter: TypedDeferredTopicFilter<TCEvent>,
    listener: TypedListener<TCEvent>
  ): Promise<this>;

  listeners<TCEvent extends TypedContractEvent>(
    event: TCEvent
  ): Promise<Array<TypedListener<TCEvent>>>;
  listeners(eventName?: string): Promise<Array<Listener>>;
  removeAllListeners<TCEvent extends TypedContractEvent>(
    event?: TCEvent
  ): Promise<this>;

  NATIVE_TOKEN: TypedContractMethod<[], [string], "view">;

  ROYALTY_LEVEL_20: TypedContractMethod<[], [bigint], "view">;

  ROYALTY_LEVEL_40: TypedContractMethod<[], [bigint], "view">;

  ROYALTY_LEVEL_60: TypedContractMethod<[], [bigint], "view">;

  ROYALTY_LEVEL_80: TypedContractMethod<[], [bigint], "view">;

  SIG_VALIDATION_FAILED: TypedContractMethod<[], [bigint], "view">;

  UPGRADE_INTERFACE_VERSION: TypedContractMethod<[], [string], "view">;

  admin: TypedContractMethod<[], [string], "view">;

  changeAdmin: TypedContractMethod<[_admin: AddressLike], [void], "nonpayable">;

  changeRoyaltyToken: TypedContractMethod<
    [_token: AddressLike],
    [void],
    "nonpayable"
  >;

  claimRoyalty: TypedContractMethod<[title: string], [void], "nonpayable">;

  emergencyWithdraw: TypedContractMethod<
    [_token: AddressLike, _amount: BigNumberish],
    [void],
    "nonpayable"
  >;

  entryPoint: TypedContractMethod<[], [string], "view">;

  getRoyalty: TypedContractMethod<[title: string], [bigint], "view">;

  hasReviewed: TypedContractMethod<
    [title: string, reviewer: AddressLike],
    [boolean],
    "view"
  >;

  initialize: TypedContractMethod<
    [
      _owner: AddressLike,
      _admin: AddressLike,
      _token: AddressLike,
      _reviewers: AddressLike[]
    ],
    [void],
    "nonpayable"
  >;

  isRecipient: TypedContractMethod<
    [title: string, recipient: AddressLike],
    [boolean],
    "view"
  >;

  isReviewer: TypedContractMethod<[reviewer: AddressLike], [boolean], "view">;

  isSubmissionClaimable: TypedContractMethod<
    [title: string],
    [boolean],
    "view"
  >;

  owner: TypedContractMethod<[], [string], "view">;

  proxiableUUID: TypedContractMethod<[], [string], "view">;

  registerSubmission: TypedContractMethod<
    [title: string, royaltyRecipient: AddressLike],
    [void],
    "nonpayable"
  >;

  renounceOwnership: TypedContractMethod<[], [void], "view">;

  reviewSubmission: TypedContractMethod<
    [title: string, royaltyLevel: BigNumberish],
    [void],
    "nonpayable"
  >;

  revokeSubmission: TypedContractMethod<[title: string], [void], "nonpayable">;

  submissions: TypedContractMethod<
    [title: string],
    [IRoyaltyAutoClaim.SubmissionStructOutput],
    "view"
  >;

  token: TypedContractMethod<[], [string], "view">;

  transferOwnership: TypedContractMethod<
    [newOwner: AddressLike],
    [void],
    "nonpayable"
  >;

  updateReviewers: TypedContractMethod<
    [_reviewers: AddressLike[], _status: boolean[]],
    [void],
    "nonpayable"
  >;

  updateRoyaltyRecipient: TypedContractMethod<
    [title: string, newRoyaltyRecipient: AddressLike],
    [void],
    "nonpayable"
  >;

  upgradeToAndCall: TypedContractMethod<
    [newImplementation: AddressLike, data: BytesLike],
    [void],
    "payable"
  >;

  validateUserOp: TypedContractMethod<
    [
      userOp: PackedUserOperationStruct,
      userOpHash: BytesLike,
      missingAccountFunds: BigNumberish
    ],
    [bigint],
    "nonpayable"
  >;

  getFunction<T extends ContractMethod = ContractMethod>(
    key: string | FunctionFragment
  ): T;

  getFunction(
    nameOrSignature: "NATIVE_TOKEN"
  ): TypedContractMethod<[], [string], "view">;
  getFunction(
    nameOrSignature: "ROYALTY_LEVEL_20"
  ): TypedContractMethod<[], [bigint], "view">;
  getFunction(
    nameOrSignature: "ROYALTY_LEVEL_40"
  ): TypedContractMethod<[], [bigint], "view">;
  getFunction(
    nameOrSignature: "ROYALTY_LEVEL_60"
  ): TypedContractMethod<[], [bigint], "view">;
  getFunction(
    nameOrSignature: "ROYALTY_LEVEL_80"
  ): TypedContractMethod<[], [bigint], "view">;
  getFunction(
    nameOrSignature: "SIG_VALIDATION_FAILED"
  ): TypedContractMethod<[], [bigint], "view">;
  getFunction(
    nameOrSignature: "UPGRADE_INTERFACE_VERSION"
  ): TypedContractMethod<[], [string], "view">;
  getFunction(
    nameOrSignature: "admin"
  ): TypedContractMethod<[], [string], "view">;
  getFunction(
    nameOrSignature: "changeAdmin"
  ): TypedContractMethod<[_admin: AddressLike], [void], "nonpayable">;
  getFunction(
    nameOrSignature: "changeRoyaltyToken"
  ): TypedContractMethod<[_token: AddressLike], [void], "nonpayable">;
  getFunction(
    nameOrSignature: "claimRoyalty"
  ): TypedContractMethod<[title: string], [void], "nonpayable">;
  getFunction(
    nameOrSignature: "emergencyWithdraw"
  ): TypedContractMethod<
    [_token: AddressLike, _amount: BigNumberish],
    [void],
    "nonpayable"
  >;
  getFunction(
    nameOrSignature: "entryPoint"
  ): TypedContractMethod<[], [string], "view">;
  getFunction(
    nameOrSignature: "getRoyalty"
  ): TypedContractMethod<[title: string], [bigint], "view">;
  getFunction(
    nameOrSignature: "hasReviewed"
  ): TypedContractMethod<
    [title: string, reviewer: AddressLike],
    [boolean],
    "view"
  >;
  getFunction(
    nameOrSignature: "initialize"
  ): TypedContractMethod<
    [
      _owner: AddressLike,
      _admin: AddressLike,
      _token: AddressLike,
      _reviewers: AddressLike[]
    ],
    [void],
    "nonpayable"
  >;
  getFunction(
    nameOrSignature: "isRecipient"
  ): TypedContractMethod<
    [title: string, recipient: AddressLike],
    [boolean],
    "view"
  >;
  getFunction(
    nameOrSignature: "isReviewer"
  ): TypedContractMethod<[reviewer: AddressLike], [boolean], "view">;
  getFunction(
    nameOrSignature: "isSubmissionClaimable"
  ): TypedContractMethod<[title: string], [boolean], "view">;
  getFunction(
    nameOrSignature: "owner"
  ): TypedContractMethod<[], [string], "view">;
  getFunction(
    nameOrSignature: "proxiableUUID"
  ): TypedContractMethod<[], [string], "view">;
  getFunction(
    nameOrSignature: "registerSubmission"
  ): TypedContractMethod<
    [title: string, royaltyRecipient: AddressLike],
    [void],
    "nonpayable"
  >;
  getFunction(
    nameOrSignature: "renounceOwnership"
  ): TypedContractMethod<[], [void], "view">;
  getFunction(
    nameOrSignature: "reviewSubmission"
  ): TypedContractMethod<
    [title: string, royaltyLevel: BigNumberish],
    [void],
    "nonpayable"
  >;
  getFunction(
    nameOrSignature: "revokeSubmission"
  ): TypedContractMethod<[title: string], [void], "nonpayable">;
  getFunction(
    nameOrSignature: "submissions"
  ): TypedContractMethod<
    [title: string],
    [IRoyaltyAutoClaim.SubmissionStructOutput],
    "view"
  >;
  getFunction(
    nameOrSignature: "token"
  ): TypedContractMethod<[], [string], "view">;
  getFunction(
    nameOrSignature: "transferOwnership"
  ): TypedContractMethod<[newOwner: AddressLike], [void], "nonpayable">;
  getFunction(
    nameOrSignature: "updateReviewers"
  ): TypedContractMethod<
    [_reviewers: AddressLike[], _status: boolean[]],
    [void],
    "nonpayable"
  >;
  getFunction(
    nameOrSignature: "updateRoyaltyRecipient"
  ): TypedContractMethod<
    [title: string, newRoyaltyRecipient: AddressLike],
    [void],
    "nonpayable"
  >;
  getFunction(
    nameOrSignature: "upgradeToAndCall"
  ): TypedContractMethod<
    [newImplementation: AddressLike, data: BytesLike],
    [void],
    "payable"
  >;
  getFunction(
    nameOrSignature: "validateUserOp"
  ): TypedContractMethod<
    [
      userOp: PackedUserOperationStruct,
      userOpHash: BytesLike,
      missingAccountFunds: BigNumberish
    ],
    [bigint],
    "nonpayable"
  >;

  getEvent(
    key: "AdminChanged"
  ): TypedContractEvent<
    AdminChangedEvent.InputTuple,
    AdminChangedEvent.OutputTuple,
    AdminChangedEvent.OutputObject
  >;
  getEvent(
    key: "EmergencyWithdraw"
  ): TypedContractEvent<
    EmergencyWithdrawEvent.InputTuple,
    EmergencyWithdrawEvent.OutputTuple,
    EmergencyWithdrawEvent.OutputObject
  >;
  getEvent(
    key: "Initialized"
  ): TypedContractEvent<
    InitializedEvent.InputTuple,
    InitializedEvent.OutputTuple,
    InitializedEvent.OutputObject
  >;
  getEvent(
    key: "OwnershipTransferred"
  ): TypedContractEvent<
    OwnershipTransferredEvent.InputTuple,
    OwnershipTransferredEvent.OutputTuple,
    OwnershipTransferredEvent.OutputObject
  >;
  getEvent(
    key: "ReviewerStatusUpdated"
  ): TypedContractEvent<
    ReviewerStatusUpdatedEvent.InputTuple,
    ReviewerStatusUpdatedEvent.OutputTuple,
    ReviewerStatusUpdatedEvent.OutputObject
  >;
  getEvent(
    key: "RoyaltyClaimed"
  ): TypedContractEvent<
    RoyaltyClaimedEvent.InputTuple,
    RoyaltyClaimedEvent.OutputTuple,
    RoyaltyClaimedEvent.OutputObject
  >;
  getEvent(
    key: "RoyaltyTokenChanged"
  ): TypedContractEvent<
    RoyaltyTokenChangedEvent.InputTuple,
    RoyaltyTokenChangedEvent.OutputTuple,
    RoyaltyTokenChangedEvent.OutputObject
  >;
  getEvent(
    key: "SubmissionRegistered"
  ): TypedContractEvent<
    SubmissionRegisteredEvent.InputTuple,
    SubmissionRegisteredEvent.OutputTuple,
    SubmissionRegisteredEvent.OutputObject
  >;
  getEvent(
    key: "SubmissionReviewed"
  ): TypedContractEvent<
    SubmissionReviewedEvent.InputTuple,
    SubmissionReviewedEvent.OutputTuple,
    SubmissionReviewedEvent.OutputObject
  >;
  getEvent(
    key: "SubmissionRevoked"
  ): TypedContractEvent<
    SubmissionRevokedEvent.InputTuple,
    SubmissionRevokedEvent.OutputTuple,
    SubmissionRevokedEvent.OutputObject
  >;
  getEvent(
    key: "SubmissionRoyaltyRecipientUpdated"
  ): TypedContractEvent<
    SubmissionRoyaltyRecipientUpdatedEvent.InputTuple,
    SubmissionRoyaltyRecipientUpdatedEvent.OutputTuple,
    SubmissionRoyaltyRecipientUpdatedEvent.OutputObject
  >;
  getEvent(
    key: "Upgraded"
  ): TypedContractEvent<
    UpgradedEvent.InputTuple,
    UpgradedEvent.OutputTuple,
    UpgradedEvent.OutputObject
  >;

  filters: {
    "AdminChanged(address,address)": TypedContractEvent<
      AdminChangedEvent.InputTuple,
      AdminChangedEvent.OutputTuple,
      AdminChangedEvent.OutputObject
    >;
    AdminChanged: TypedContractEvent<
      AdminChangedEvent.InputTuple,
      AdminChangedEvent.OutputTuple,
      AdminChangedEvent.OutputObject
    >;

    "EmergencyWithdraw(address,uint256)": TypedContractEvent<
      EmergencyWithdrawEvent.InputTuple,
      EmergencyWithdrawEvent.OutputTuple,
      EmergencyWithdrawEvent.OutputObject
    >;
    EmergencyWithdraw: TypedContractEvent<
      EmergencyWithdrawEvent.InputTuple,
      EmergencyWithdrawEvent.OutputTuple,
      EmergencyWithdrawEvent.OutputObject
    >;

    "Initialized(uint64)": TypedContractEvent<
      InitializedEvent.InputTuple,
      InitializedEvent.OutputTuple,
      InitializedEvent.OutputObject
    >;
    Initialized: TypedContractEvent<
      InitializedEvent.InputTuple,
      InitializedEvent.OutputTuple,
      InitializedEvent.OutputObject
    >;

    "OwnershipTransferred(address,address)": TypedContractEvent<
      OwnershipTransferredEvent.InputTuple,
      OwnershipTransferredEvent.OutputTuple,
      OwnershipTransferredEvent.OutputObject
    >;
    OwnershipTransferred: TypedContractEvent<
      OwnershipTransferredEvent.InputTuple,
      OwnershipTransferredEvent.OutputTuple,
      OwnershipTransferredEvent.OutputObject
    >;

    "ReviewerStatusUpdated(address,bool)": TypedContractEvent<
      ReviewerStatusUpdatedEvent.InputTuple,
      ReviewerStatusUpdatedEvent.OutputTuple,
      ReviewerStatusUpdatedEvent.OutputObject
    >;
    ReviewerStatusUpdated: TypedContractEvent<
      ReviewerStatusUpdatedEvent.InputTuple,
      ReviewerStatusUpdatedEvent.OutputTuple,
      ReviewerStatusUpdatedEvent.OutputObject
    >;

    "RoyaltyClaimed(address,uint256,string)": TypedContractEvent<
      RoyaltyClaimedEvent.InputTuple,
      RoyaltyClaimedEvent.OutputTuple,
      RoyaltyClaimedEvent.OutputObject
    >;
    RoyaltyClaimed: TypedContractEvent<
      RoyaltyClaimedEvent.InputTuple,
      RoyaltyClaimedEvent.OutputTuple,
      RoyaltyClaimedEvent.OutputObject
    >;

    "RoyaltyTokenChanged(address,address)": TypedContractEvent<
      RoyaltyTokenChangedEvent.InputTuple,
      RoyaltyTokenChangedEvent.OutputTuple,
      RoyaltyTokenChangedEvent.OutputObject
    >;
    RoyaltyTokenChanged: TypedContractEvent<
      RoyaltyTokenChangedEvent.InputTuple,
      RoyaltyTokenChangedEvent.OutputTuple,
      RoyaltyTokenChangedEvent.OutputObject
    >;

    "SubmissionRegistered(string,address,string)": TypedContractEvent<
      SubmissionRegisteredEvent.InputTuple,
      SubmissionRegisteredEvent.OutputTuple,
      SubmissionRegisteredEvent.OutputObject
    >;
    SubmissionRegistered: TypedContractEvent<
      SubmissionRegisteredEvent.InputTuple,
      SubmissionRegisteredEvent.OutputTuple,
      SubmissionRegisteredEvent.OutputObject
    >;

    "SubmissionReviewed(string,address,uint16,string)": TypedContractEvent<
      SubmissionReviewedEvent.InputTuple,
      SubmissionReviewedEvent.OutputTuple,
      SubmissionReviewedEvent.OutputObject
    >;
    SubmissionReviewed: TypedContractEvent<
      SubmissionReviewedEvent.InputTuple,
      SubmissionReviewedEvent.OutputTuple,
      SubmissionReviewedEvent.OutputObject
    >;

    "SubmissionRevoked(string,string)": TypedContractEvent<
      SubmissionRevokedEvent.InputTuple,
      SubmissionRevokedEvent.OutputTuple,
      SubmissionRevokedEvent.OutputObject
    >;
    SubmissionRevoked: TypedContractEvent<
      SubmissionRevokedEvent.InputTuple,
      SubmissionRevokedEvent.OutputTuple,
      SubmissionRevokedEvent.OutputObject
    >;

    "SubmissionRoyaltyRecipientUpdated(string,address,address,string)": TypedContractEvent<
      SubmissionRoyaltyRecipientUpdatedEvent.InputTuple,
      SubmissionRoyaltyRecipientUpdatedEvent.OutputTuple,
      SubmissionRoyaltyRecipientUpdatedEvent.OutputObject
    >;
    SubmissionRoyaltyRecipientUpdated: TypedContractEvent<
      SubmissionRoyaltyRecipientUpdatedEvent.InputTuple,
      SubmissionRoyaltyRecipientUpdatedEvent.OutputTuple,
      SubmissionRoyaltyRecipientUpdatedEvent.OutputObject
    >;

    "Upgraded(address)": TypedContractEvent<
      UpgradedEvent.InputTuple,
      UpgradedEvent.OutputTuple,
      UpgradedEvent.OutputObject
    >;
    Upgraded: TypedContractEvent<
      UpgradedEvent.InputTuple,
      UpgradedEvent.OutputTuple,
      UpgradedEvent.OutputObject
    >;
  };
}
