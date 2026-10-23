# Devpost draft

## How we used Qloo

- Every swiped taste resolves to an exact Qloo id ahead of time, so a Yes goes straight into `signal.interests.entities` (or `signal.interests.tags` for topics) with no guessing.
- The swipe deck is built from Qloo-verified seeds and refilled from the person's own Yeses with `GET /v2/insights` and `signal.interests.entities`.
- The shared tastes in the Overview, which the taste magnets pull on, come from the crowd tags Qloo puts on both your crowd and each partner (the flow's middle column), showing a strength only when Qloo scores that tag for the partner's own crowd (no invented percentages).
- Every card says where it came from: checked on Qloo, refilled from Qloo, a recorded example, or a sample card that is not from Qloo.
