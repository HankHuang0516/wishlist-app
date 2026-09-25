// QA-only visual identity check. The server re-encodes uploads, so a byte hash
// of the original PNG would reject the correct photo after JPEG/WebP conversion.
function meanRgbDistance(actual, expected) {
  if (!Buffer.isBuffer(actual) || !Buffer.isBuffer(expected) || actual.length !== 32 * 32 * 3 || expected.length !== actual.length)
    throw new Error('Invalid QA photo sample');
  let difference = 0;
  for (let index = 0; index < actual.length; index++) difference += Math.abs(actual[index] - expected[index]);
  return difference / actual.length;
}

async function fixtureDistance(sharp, photoBytes, fixtureBytes) {
  const pixels = input => sharp(input).autoOrient().resize(32, 32, { fit: 'fill' }).removeAlpha().raw().toBuffer();
  const [actual, expected] = await Promise.all([pixels(photoBytes), pixels(fixtureBytes)]);
  return meanRgbDistance(actual, expected);
}

module.exports = { meanRgbDistance, fixtureDistance };
