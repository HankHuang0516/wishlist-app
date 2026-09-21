// Xcode app-target build phase. Print no environment values or credentials.
const { assertIosQaBuild } = require('./ios-qa-config.cjs');
try { assertIosQaBuild(process.env); }
catch { console.error('iOS QA build boundary rejected; diagnostic values withheld'); process.exitCode = 1; }
