合作意向可靠收件修復

partners → /partners/inquiry 使用專用表單。一般 feedback 亦保存匿名內容。收到資料時先於同一 DB transaction 保存原始資料與 SubmissionReceipt，回傳 receipt UUID 作為 inquiryId。相同 clientSubmissionId/相同內容只回原收據；不同內容409。AI不在一般回饋收件路徑，人工處理。

通知狀態 ACCEPTED 僅代表既有 Resend 接受，不代表收件匣送達；FAILED、UNKNOWN、PENDING 可透過現有 x-admin-key 的 GET /api/submissions 與 /:id 查閱。不自動重寄不確定通知。合作資料與一般回饋不建立商品、不構成授權。

Migration僅新增 PartnerInquiry、SubmissionReceipt，Feedback.userId可空及contactEmail欄位。保留既有資料，無刪除或覆寫。舊 Feedback不回填假收據或假通知狀態；Hank匿名test未持久化，不能從DB回填。若需回填其內容必須另確認原信與身分，不重送。

回滾：回復先前成功部署 commit 0671100c7afe18931d54ede661a88736d263d8fc 的程式；保留新增表及nullable欄位，不DROP、不刪除已收件資料。舊程式可繼續使用原Feedback欄位。回滾後先停對外合作提交，避免重回匿名不保存流程。部署前保存既有production schema快照及待施行migration清單；既有8件商品不變。

驗證資料必須明確標示TEST，不納入商家授權或商品件數。只用使用者既有信箱作回覆窗口，不新服務或新金鑰。

Reply-To 補正：只用已通過單一信箱驗證的合作 contactEmail／匿名意見 Email；不改 From、DNS 或既有其他寄信呼叫。登入意見沒有表單聯絡信箱時維持管理端查閱人工回覆。既有通知不重寄。回滾此補正可恢復 c100bd1；無DB migration。

DMARC唯讀核對：兩個Cloudflare權威NS均回覆 _dmarc.twopiggyhavefun.uk TXT NXDOMAIN。待核准候選：TXT _dmarc，內容 v=DMARC1; p=none; adkim=r; aspf=r，TTL Auto或300。只觀察，不要求隔離/拒收；不設未核實rua地址、不改SPF/DKIM。影響整個twopiggyhavefun.uk網域寄信來源；需確認其他寄件服務對齊。回滾只刪新增紀錄。DNS未改，不能保證解決垃圾郵件。
