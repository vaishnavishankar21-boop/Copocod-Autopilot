export async function simulateNetwork<T>(
  payload: T,
  delay = 1000
): Promise<T> {

  await new Promise((resolve) =>
    setTimeout(resolve, delay)
  );

  return payload;
}