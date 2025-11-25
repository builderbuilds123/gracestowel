import { CalendarDate } from "@internationalized/date";
import * as React from "react";
import { type CalendarProps as BaseCalendarProps } from "react-aria";
interface CalendarValueProps {
    /**
     * The currently selected date.
     */
    value?: Date | null;
    /**
     * The date that is selected when the calendar first mounts (uncontrolled).
     */
    defaultValue?: Date | null;
    /**
     * A function that is triggered when the selected date changes.
     */
    onChange?: (value: Date | null) => void;
    /**
     * A function that determines whether a date is unavailable for selection.
     */
    isDateUnavailable?: (date: Date) => boolean;
    /**
     * The minimum date that can be selected.
     */
    minValue?: Date;
    /**
     * The maximum date that can be selected.
     */
    maxValue?: Date;
}
interface CalendarProps extends Omit<BaseCalendarProps<CalendarDate>, keyof CalendarValueProps>, CalendarValueProps {
}
/**
 * Calendar component used to select a date.
 * Its props are based on [React Aria Calendar](https://react-spectrum.adobe.com/react-aria/Calendar.html#calendar-1).
 *
 * @excludeExternal
 */
declare const Calendar: (props: CalendarProps) => React.JSX.Element;
export { Calendar };
//# sourceMappingURL=calendar.d.ts.map