// PayPal account ids: 13 characters from 2-9 and A-Z without I and O (PayPal rejects any other
// payee merchant_id with INVALID_PARAMETER_SYNTAX). Shared by the operator's
// assign-paypal-destination and the member's seller request (S43).
export const PAYPAL_MERCHANT_ID = /^[2-9A-HJ-NP-Z]{13}$/;
