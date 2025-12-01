"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCalendarDate = createCalendarDate;
exports.createCalendarDateFromDate = createCalendarDateFromDate;
exports.getDefaultCalendarDate = getDefaultCalendarDate;
exports.getDefaultCalendarDateFromDate = getDefaultCalendarDateFromDate;
exports.updateCalendarDate = updateCalendarDate;
exports.updateCalendarDateFromDate = updateCalendarDateFromDate;
const date_1 = require("@internationalized/date");
function getDefaultCalendarDateTime(value, defaultValue) {
    if (value) {
        return createCalendarDateTime(value);
    }
    if (defaultValue) {
        return createCalendarDateTime(defaultValue);
    }
    return null;
}
function createCalendarDateTime(date) {
    return new date_1.CalendarDateTime(date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds());
}
function updateCalendarDateTime(date, value) {
    if (!date) {
        return createCalendarDateTime(value);
    }
    date.set({
        day: value.getDate(),
        month: value.getMonth() + 1,
        year: value.getFullYear(),
        hour: value.getHours(),
        minute: value.getMinutes(),
        second: value.getSeconds(),
        millisecond: value.getMilliseconds(),
    });
    return date;
}
function getDefaultCalendarDate(value, defaultValue) {
    if (value) {
        return createCalendarDate(value);
    }
    if (defaultValue) {
        return createCalendarDate(defaultValue);
    }
    return null;
}
function createCalendarDate(date) {
    return new date_1.CalendarDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
}
function updateCalendarDate(date, value) {
    if (!date) {
        return createCalendarDate(value);
    }
    date.set({
        day: value.getDate(),
        month: value.getMonth() + 1,
        year: value.getFullYear(),
    });
    return date;
}
const USES_TIME = new Set(["hour", "minute", "second"]);
function createCalendarDateFromDate(date, granularity) {
    if (granularity && USES_TIME.has(granularity)) {
        return createCalendarDateTime(date);
    }
    return createCalendarDate(date);
}
function updateCalendarDateFromDate(date, value, granularity) {
    if (granularity && USES_TIME.has(granularity)) {
        return updateCalendarDateTime(date, value);
    }
    return updateCalendarDate(date, value);
}
function getDefaultCalendarDateFromDate(value, defaultValue, granularity) {
    if (value) {
        return createCalendarDateFromDate(value, granularity);
    }
    if (defaultValue) {
        return createCalendarDateFromDate(defaultValue, granularity);
    }
    return null;
}
//# sourceMappingURL=calendar.js.map