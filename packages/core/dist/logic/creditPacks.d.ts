/** The only credit-pack catalog. Prices are AUD cents. Stripe price ids stay in env. */
export interface CreditPack {
    id: string;
    credits: number;
    priceAudCents: number;
    label: string;
    popular?: boolean;
    stripePriceEnv: string;
}
export declare const CREDIT_PACKS: readonly CreditPack[];
export declare function creditPackById(id: string): CreditPack | null;
export declare function creditsForStripePrice(priceId: string, env: Record<string, string | undefined>): number | null;
