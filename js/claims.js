/* 開発者が発行した電子署名付きQRだけを検証します。秘密鍵やQR一覧は公開しません。 */
import { SPECIES } from "./engine.js";
const PUBLIC_KEY = {
  key_ops: ["verify"],
  ext: true,
  kty: "EC",
  x: "1zTuT2Oz6jtLpwUA-CP0I7U5qFVX8EPigYtyr8AWFFs",
  y: "DnaZtNc1b0gnsnoeUT_OLWRyq9U49NAcrDQ07GgXGb0",
  crv: "P-256",
};
let importedKey;
function bytes(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("QRの形式が違います。");
  const raw = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
export function extractClaim(value) {
  if (typeof value !== "string" || value.length > 5000)
    throw new Error("このQRは使えません。");
  let token = value.trim();
  try {
    const url = new URL(token);
    token =
      new URLSearchParams(url.hash.slice(1)).get("claim") ||
      url.searchParams.get("claim") ||
      token;
  } catch {}
  return token;
}
export async function inspectClaim(value) {
  if (!crypto.subtle)
    throw new Error("QRの確認にはHTTPSのSafariまたはChromeで開いてください。");
  const token = extractClaim(value),
    parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "qm2" || parts[1].length > 1200)
    throw new Error("開発者から配られた新しいQRを読み取ってください。");
  try {
    importedKey ??= crypto.subtle.importKey(
      "jwk",
      PUBLIC_KEY,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    const signature = bytes(parts[2]);
    if (
      signature.length !== 64 ||
      !(await crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        await importedKey,
        signature,
        new TextEncoder().encode(parts[1]),
      ))
    )
      throw new Error();
    const p = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes(parts[1])),
    );
    if (
      p.v !== 2 ||
      typeof p.id !== "string" ||
      !/^[A-Za-z0-9_-]{8,100}$/.test(p.id)
    )
      throw new Error();
    if (
      p.kind === "monster" &&
      Number.isInteger(p.species) &&
      p.species >= 0 &&
      p.species < SPECIES.length
    )
      return { ...p, token, label: SPECIES[p.species].name };
    if (
      p.kind === "material" &&
      Number.isInteger(p.amount) &&
      p.amount >= 1 &&
      p.amount <= 99
    )
      return { ...p, token, label: "強化クリスタル × " + p.amount };
    throw new Error();
  } catch {
    throw new Error(
      "発行元を確認できませんでした。開発者から配られたQRを使ってください。",
    );
  }
}
