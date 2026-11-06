"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OutboxEventStatus = exports.WaitlistOfferStatus = exports.WaitlistStatus = exports.PaymentAttemptStatus = exports.AllocationStatus = exports.BookingStatus = exports.MembershipStatus = exports.MembershipRole = exports.PolicyMode = void 0;
var PolicyMode;
(function (PolicyMode) {
    PolicyMode["FREE_RESERVATION"] = "FREE_RESERVATION";
    PolicyMode["DEPOSIT_REQUIRED"] = "DEPOSIT_REQUIRED";
})(PolicyMode || (exports.PolicyMode = PolicyMode = {}));
var MembershipRole;
(function (MembershipRole) {
    MembershipRole["OWNER"] = "OWNER";
    MembershipRole["MANAGER"] = "MANAGER";
    MembershipRole["HOST"] = "HOST";
})(MembershipRole || (exports.MembershipRole = MembershipRole = {}));
var MembershipStatus;
(function (MembershipStatus) {
    MembershipStatus["ACTIVE"] = "ACTIVE";
    MembershipStatus["INVITED"] = "INVITED";
    MembershipStatus["SUSPENDED"] = "SUSPENDED";
})(MembershipStatus || (exports.MembershipStatus = MembershipStatus = {}));
var BookingStatus;
(function (BookingStatus) {
    BookingStatus["HOLD_ACTIVE"] = "HOLD_ACTIVE";
    BookingStatus["PAYMENT_PENDING"] = "PAYMENT_PENDING";
    BookingStatus["PAYMENT_REVIEW"] = "PAYMENT_REVIEW";
    BookingStatus["CONFIRMED"] = "CONFIRMED";
    BookingStatus["READY"] = "READY";
    BookingStatus["SEATED"] = "SEATED";
    BookingStatus["COMPLETED"] = "COMPLETED";
    BookingStatus["CANCELLED"] = "CANCELLED";
    BookingStatus["NO_SHOW"] = "NO_SHOW";
    BookingStatus["EXPIRED"] = "EXPIRED";
    BookingStatus["PAYMENT_FAILED"] = "PAYMENT_FAILED";
})(BookingStatus || (exports.BookingStatus = BookingStatus = {}));
var AllocationStatus;
(function (AllocationStatus) {
    AllocationStatus["HELD"] = "HELD";
    AllocationStatus["OFFER_HELD"] = "OFFER_HELD";
    AllocationStatus["PAYMENT_PENDING"] = "PAYMENT_PENDING";
    AllocationStatus["PAYMENT_REVIEW"] = "PAYMENT_REVIEW";
    AllocationStatus["CONFIRMED"] = "CONFIRMED";
    AllocationStatus["READY"] = "READY";
    AllocationStatus["SEATED"] = "SEATED";
    AllocationStatus["COMPLETED"] = "COMPLETED";
    AllocationStatus["RELEASED"] = "RELEASED";
    AllocationStatus["CANCELLED"] = "CANCELLED";
})(AllocationStatus || (exports.AllocationStatus = AllocationStatus = {}));
var PaymentAttemptStatus;
(function (PaymentAttemptStatus) {
    PaymentAttemptStatus["INITIATED"] = "INITIATED";
    PaymentAttemptStatus["PENDING_REVIEW"] = "PENDING_REVIEW";
    PaymentAttemptStatus["CAPTURED"] = "CAPTURED";
    PaymentAttemptStatus["FAILED"] = "FAILED";
    PaymentAttemptStatus["REFUNDED"] = "REFUNDED";
})(PaymentAttemptStatus || (exports.PaymentAttemptStatus = PaymentAttemptStatus = {}));
var WaitlistStatus;
(function (WaitlistStatus) {
    WaitlistStatus["WAITING"] = "WAITING";
    WaitlistStatus["OFFER_EXTENDED"] = "OFFER_EXTENDED";
    WaitlistStatus["SEATED"] = "SEATED";
    WaitlistStatus["CANCELLED"] = "CANCELLED";
    WaitlistStatus["EXPIRED"] = "EXPIRED";
})(WaitlistStatus || (exports.WaitlistStatus = WaitlistStatus = {}));
var WaitlistOfferStatus;
(function (WaitlistOfferStatus) {
    WaitlistOfferStatus["OFFERED"] = "OFFERED";
    WaitlistOfferStatus["ACCEPTED"] = "ACCEPTED";
    WaitlistOfferStatus["EXPIRED"] = "EXPIRED";
    WaitlistOfferStatus["DECLINED"] = "DECLINED";
})(WaitlistOfferStatus || (exports.WaitlistOfferStatus = WaitlistOfferStatus = {}));
var OutboxEventStatus;
(function (OutboxEventStatus) {
    OutboxEventStatus["PENDING"] = "PENDING";
    OutboxEventStatus["PUBLISHED"] = "PUBLISHED";
    OutboxEventStatus["FAILED"] = "FAILED";
})(OutboxEventStatus || (exports.OutboxEventStatus = OutboxEventStatus = {}));
//# sourceMappingURL=enums.js.map