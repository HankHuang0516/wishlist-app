// Builds <=40 require a nonempty legacy phoneNumber field just to admit a
// session. Keep that wire contract without inventing/storing a telephone number.
// New clients display contactPhoneNumber; SMS/public profile routes read the DB.
export function sessionContact(user: { id: number; phoneNumber: string | null }) {
    return {
        phoneNumber: user.phoneNumber ?? `account:${user.id}`,
        contactPhoneNumber: user.phoneNumber,
        phoneNumberIsLegacyIdentifier: user.phoneNumber === null,
    };
}
