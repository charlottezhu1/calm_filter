"""The paper's affect rule, applied to raw SentiStrength scores.

ss_pos runs 1 to 5 and ss_neg runs -1 to -5, where 1 / -1 means no sentiment
found. The two sides are independent, so a post can carry one positive and one
negative label at once (for example LAN and LAP).

    HAN  ss_neg <= -3
    LAN  ss_neg == -2
    HAP  ss_pos >= 3
    LAP  ss_pos == 2
    NEU  ss_pos == 1 and ss_neg == -1
"""

CLASSES = ('HAN', 'LAN', 'HAP', 'LAP', 'NEU')


def classify_affect(ss_pos, ss_neg):
    return {
        'HAN': ss_neg <= -3,
        'LAN': ss_neg == -2,
        'HAP': ss_pos >= 3,
        'LAP': ss_pos == 2,
        'NEU': ss_pos == 1 and ss_neg == -1,
    }
