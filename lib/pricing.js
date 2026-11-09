// Margin model: the yard gets its full price at pickup.
// Wreckly's reservation fee (10% of the yard's price) is added on top and paid online by the buyer.
const FEE_RATE = 0.10;
const MIN_FEE_CENTS = 50; // Stripe minimum

const feeFor = (yardCents) => Math.max(MIN_FEE_CENTS, Math.round(yardCents * FEE_RATE));
const totalFor = (yardCents) => yardCents + feeFor(yardCents);

module.exports = { FEE_RATE, feeFor, totalFor };
