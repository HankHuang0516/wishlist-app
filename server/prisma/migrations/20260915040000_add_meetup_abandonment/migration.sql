ALTER TABLE "MeetupOperation" ADD COLUMN "abandoned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MeetupOperation" DROP CONSTRAINT "MeetupOperation_action_check";
ALTER TABLE "MeetupOperation" ADD CONSTRAINT "MeetupOperation_action_check" CHECK (
    "action" IN ('PROPOSE', 'REVISE', 'CONFIRM', 'CANCEL', 'COMPLETE')
    AND (("abandoned" = false AND "resultingVersion" > 0) OR ("abandoned" = true AND "resultingVersion" = 0))
);
