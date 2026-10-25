# Traditional Chinese font for CI evidence

CI installs only the official Noto Sans CJK TC Regular OTF from
`notofonts/noto-cjk` commit `f8d157532fbfaeda587e826d4cd5b21a49186f7c`,
path `Sans/OTF/TraditionalChinese/NotoSansCJKtc-Regular.otf`.
The16,435,884-byte file has Git blob
`f9376bae1d421520f73a3c6c9d50b22f89548301` and SHA256
`dce08bd4fd91aa8aa76ed8fea4b694c2dfb8550f67871e326843212ddbeb88b4`.
The upstream font family was checked as `Noto Sans CJK TC`.

This font is licensed under the SIL Open Font License1.1; see
[the pinned upstream license](https://github.com/notofonts/noto-cjk/blob/f8d157532fbfaeda587e826d4cd5b21a49186f7c/Sans/LICENSE).
It is an ephemeral CI dependency for synthetic browser screenshots, not shipped
application artwork or an app font. Original app icons and the selected H are
unchanged. Download attempts are bounded, bytes are checked before font-cache
registration, and absence of the required TC family still fails the job.

This replaces a61.2MB Ubuntu mirror package whose download exceeded the
five-minute step budget in CI40224080529. It does not skip font validation or
weaken any storage/receipt, HTTP/database, image or application test gate.
