# Disable lead + hard snap

In `src/lib/brush/bristles.ts`:

1. Remove the hard-snap block in `step()`:
```
if (!sample.hold && sample.pressure < 0.55) {
  hair.tip.x = target.x;
  ...
  continue;
}
```

2. In `target()`, set `const lead = 0` instead of the pressure threshold.

Also removed the soft lift snap (`else if (lift > 0.45)`) as it was the same family of correction.

See bristles.ts in this folder for the full file.
