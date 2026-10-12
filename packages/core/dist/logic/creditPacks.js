"use strict";
/** The only credit-pack catalog. Prices are AUD cents. Stripe price ids stay in env. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CREDIT_PACKS = void 0;
exports.creditPackById = creditPackById;
exports.creditsForStripePrice = creditsForStripePrice;
exports.CREDIT_PACKS = [
    { id: 'credits_100', credits: 100, priceAudCents: 800, label: '100 credits', stripePriceEnv: 'STRIPE_PRICE_CREDITS_100' },
    { id: 'credits_500', credits: 500, priceAudCents: 3200, label: '500 credits', popular: true, stripePriceEnv: 'STRIPE_PRICE_CREDITS_500' },
    { id: 'credits_2000', credits: 2000, priceAudCents: 10000, label: '2,000 credits', stripePriceEnv: 'STRIPE_PRICE_CREDITS_2000' },
    { id: 'credits_10000', credits: 10000, priceAudCents: 39000, label: '10,000 credits', stripePriceEnv: 'STRIPE_PRICE_CREDITS_10000' },
];
const LEGACY_PACK_IDS = {
    starter: 'credits_100',
    standard: 'credits_500',
    pro: 'credits_2000',
    professional: 'credits_10000',
};
function creditPackById(id) {
    const canonical = LEGACY_PACK_IDS[id] ?? id;
    return exports.CREDIT_PACKS.find((pack) => pack.id === canonical) ?? null;
}
function creditsForStripePrice(priceId, env) {
    if (!priceId)
        return null;
    const pack = exports.CREDIT_PACKS.find((row) => env[row.stripePriceEnv] && env[row.stripePriceEnv] === priceId);
    return pack?.credits ?? null;
}
//# sourceMappingURL=creditPacks.js.map