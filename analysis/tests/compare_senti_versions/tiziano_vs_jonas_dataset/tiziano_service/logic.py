import datetime

import pytz
from py4j.java_gateway import JavaGateway

from feed_manager import XFeedManager

gateway = JavaGateway()


def parse(output):
    pos = int(output[0:1])
    neg = int(output[2:4])

    NEU, LAP, HAP, LAN, HAN = 0, 0, 0, 0, 0

    if pos == 1 and neg == -1:
        NEU = 1
    else:
        if 1 < pos < 3:
            LAP = 1
        if pos >= 3:
            HAP = 1
        if -1 > neg > -3:
            LAN = 1
        if neg <= -3:
            HAN = 1

    return {
        "pos": pos,
        "neg": neg,
        "NEU": NEU,
        "LAP": LAP,
        "HAP": HAP,
        "LAN": LAN,
        "HAN": HAN,
        "text": output,
    }


def get_score(text):
    response = gateway.entry_point.getScore(text)
    return parse(response)


def get_custom_feed(db, batch_id, user_id, feed_info):
    user_group = db.get_user_group(user_id)
    day_index = db.get_user_day_index(user_id)

    current_condition = get_current_condition(user_group, day_index)

    print(user_id, user_group, day_index, current_condition)

    feed_manager = XFeedManager(feed_info)
    scores = {}

    HAN = []
    for i, item in feed_manager.metadata().items():
        if i.startswith("tweet-") or i.startswith("home-conversation-"):
            scores[i] = get_score(item["text"])
            db.save_score(
                batch_id,
                user_id,
                i,
                item["text"],
                scores[i],
                day_index,
                current_condition,
            )
            if scores[i]["HAN"] == 1:
                HAN.append(i)

    print("HAN", HAN)
    exclusion_list = []
    if current_condition == "on":
        exclusion_list = HAN
    print("exclusion_list", exclusion_list)
    custom_feed = feed_manager.get_filtered(exclusion_list)
    return custom_feed, scores, feed_manager.feed.retweets_mapping, current_condition


def get_current_condition(user_group, day_index):
    if user_group == "group1" and 8 <= day_index <= 14:
        return "on"
    if user_group == "group2" and 15 <= day_index <= 21:
        return "on"
    if 28 < day_index >= 32:
        return "end"
    if day_index > 32:
        return "disable"
    return "off"


# def is_pre_filter_on_day(day_index):
#     return (day_index == 7 and user_group == "group1") or (day_index == 14 and user_group == "group2")
#
#
# def is_filter_off_day(user_group, day_index):
#     return (day_index == 14 and user_group == "group1") or (day_index == 21 and user_group == "group2")


def has_eod_banner(db, user_id, start_hour):
    # return True
    user_time = db.get_user_local_time(user_id)
    if user_time.hour >= start_hour:
        day_index = db.get_user_day_index(user_id)
        if day_index < 1 or day_index > 28:
            return False
        already_answered = db.get_variable(
            (user_id, "daily_survey", str(day_index)), False
        ) or db.get_variable((user_id, "daily_survey", day_index), False)
        print("already_answered =", already_answered)
        return not already_answered
    return False


def survey_completed(db, key):
    return db.get_variable(key, False)


# def get_survey_off_date(db, user_id):
#     user = db.users.find_one({"user_id": user_id}, {"registration_time": 1, "timezone": 1})
#     user_timezone = pytz.timezone(user['timezone'])
#     registration_time = user['registration_time'].astimezone(user_timezone)
#     if group == 'group1':
#         offset = 14
#     else:
#         offset = 21
#     return registration_time + datetime.timedelta(days=offset)
#
#
# def get_survey_on_date(db, user_id):
#     user = db.users.find_one({"user_id": user_id}, {"registration_time": 1, "timezone": 1})
#     user_timezone = pytz.timezone(user['timezone'])
#     registration_time = user['registration_time'].astimezone(user_timezone)
#     if group == 'group1':
#         offset = 7
#     else:
#         offset = 14
#     return registration_time + datetime.timedelta(days=offset)
