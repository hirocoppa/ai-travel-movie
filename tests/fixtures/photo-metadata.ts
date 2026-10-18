// Synthetic EXIF GPS/date and XMP place names. No private photo metadata.
export function withPhotoMetadata(jpeg: Uint8Array, includePlaceName = true) {
  const tiff = new Uint8Array(198);
  const v = new DataView(tiff.buffer);
  tiff.set([0x49, 0x49, 42, 0, 8, 0, 0, 0]);
  const u16 = (at: number, n: number) => v.setUint16(at, n, true);
  const u32 = (at: number, n: number) => v.setUint32(at, n, true);
  function entry(at: number, tag: number, type: number, count: number, value: number) {
    u16(at, tag); u16(at + 2, type); u32(at + 4, count); u32(at + 8, value);
  }
  u16(8, 2); entry(10, 0x8769, 4, 1, 38); entry(22, 0x8825, 4, 1, 68);
  u16(38, 2); entry(40, 0x9003, 2, 20, 122); entry(52, 0x9011, 2, 7, 142);
  u16(68, 4);
  entry(70, 1, 2, 2, 78); entry(82, 2, 5, 3, 150);
  entry(94, 3, 2, 2, 69); entry(106, 4, 5, 3, 174);
  tiff.set(new TextEncoder().encode("2025:01:02 00:30:00\0"), 122);
  tiff.set(new TextEncoder().encode("+09:00\0"), 142);
  for (const [at, numbers] of [[150, [35, 41, 0]], [174, [139, 42, 0]]] as const)
    numbers.forEach((n, i) => { u32(at + i * 8, n); u32(at + i * 8 + 4, 1); });
  const exif = new Uint8Array(tiff.length + 6);
  exif.set([69, 120, 105, 102, 0, 0]); exif.set(tiff, 6);
  function app1(data: Uint8Array) {
    const bytes = new Uint8Array(data.length + 4);
    bytes.set([255, 225]); new DataView(bytes.buffer).setUint16(2, data.length + 2);
    bytes.set(data, 4); return bytes;
  }
  const xmp = new TextEncoder().encode('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/" xmlns:Iptc4xmpCore="http://iptc.org/std/Iptc4xmpCore/1.0/xmlns/" photoshop:City="Tokyo" photoshop:Country="Japan" Iptc4xmpCore:Location="Asakusa"/></rdf:RDF></x:xmpmeta>');
  const segments = [jpeg.slice(0, 2), app1(exif), ...(includePlaceName ? [app1(xmp)] : []), jpeg.slice(2)];
  const result = new Uint8Array(segments.reduce((sum, part) => sum + part.length, 0));
  let at = 0; for (const part of segments) { result.set(part, at); at += part.length; }
  return result;
}
