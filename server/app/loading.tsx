import { Card, Skeleton, Stack } from '@/components/ui';

/** Shown while a page's data loads, so taps feel instant instead of blank. */
export default function Loading() {
  return (
    <main className="view" aria-busy="true" aria-label="Loading">
      <Stack gap={12}>
        <Skeleton h={28} w="45%" />
        {[0, 1, 2].map((i) => (
          <Card key={i}>
            <Stack gap={8}>
              <Skeleton h={16} w="70%" />
              <Skeleton h={12} w="45%" />
            </Stack>
          </Card>
        ))}
      </Stack>
    </main>
  );
}
