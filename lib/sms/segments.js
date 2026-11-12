const GSM =
  /^[\n\r @£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./0-9:;<=>?¡A-ZÄÖÑÜ§¿a-zäöñüà^{}\\[~\]|€]*$/;
export function smsSegments(text) {
  const s = String(text || "");
  const gsm = GSM.test(s);
  const len = gsm
    ? [...s].reduce((n, c) => n + ("^{}\\[~]|€".includes(c) ? 2 : 1), 0)
    : [...s].length;
  const single = gsm ? 160 : 70;
  const multi = gsm ? 153 : 67;
  return {
    length: len,
    encoding: gsm ? "GSM-7" : "Unicode",
    segments: len === 0 ? 0 : len <= single ? 1 : Math.ceil(len / multi),
  };
}
