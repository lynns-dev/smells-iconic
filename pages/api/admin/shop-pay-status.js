import { shopify, walletConfigured, SHOP_ID } from '../../../lib/shopPayWallet';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).end();
  const configured = walletConfigured();
  if (!configured) return res.status(200).json({ configured: false });
  try {
    const data = await shopify('query WalletShop { shop { id name } }', {}, true);
    const matchesShop = data.shop?.id === `gid://shopify/Shop/${SHOP_ID}`;
    return res.status(matchesShop ? 200 : 409).json({ configured, matchesShop, shopId: data.shop?.id, rollout: '50/50' });
  } catch { return res.status(502).json({ configured, error: 'Shopify API authentication failed.' }); }
}
