/**
 * Standalone Math Engine
 * Unrelated utility algorithm
 */

export function fibonacci(n, memo = {}) {
  if (n in memo) return memo[n];
  if (n <= 1) return n;
  memo[n] = fibonacci(n - 1, memo) + fibonacci(n - 2, memo);
  return memo[n];
}

export function primeFactors(n) {
  const factors = [];
  let divisor = 2;
  while (n >= 2) {
    if (n % divisor === 0) {
      factors.push(divisor);
      n = n / divisor;
    } else {
      divisor++;
    }
  }
  return factors;
}

export function gcd(a, b) {
  return b === 0 ? a : gcd(b, a % b);
}

export function lcm(a, b) {
  return (a * b) / gcd(a, b);
}

export function sieveOfEratosthenes(limit) {
  const primes = [];
  const isPrime = new Array(limit + 1).fill(true);
  isPrime[0] = isPrime[1] = false;

  for (let p = 2; p * p <= limit; p++) {
    if (isPrime[p]) {
      for (let i = p * p; i <= limit; i += p) {
        isPrime[i] = false;
      }
    }
  }

  for (let i = 2; i <= limit; i++) {
    if (isPrime[i]) primes.push(i);
  }
  return primes;
}

export function runBenchmark() {
  const start = performance.now();
  const primes = sieveOfEratosthenes(100000);
  const end = performance.now();
  return { count: primes.length, durationMs: end - start };
}
