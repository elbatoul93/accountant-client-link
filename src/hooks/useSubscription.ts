import { useEffect, useState } from "react";
import { billingRpc, type MySubscription } from "@/lib/billing";

/** The accountant's own subscription. Any error (migration not applied yet, offline) means no restriction. */
export const useSubscription = (): MySubscription | null => {
  const [sub, setSub] = useState<MySubscription | null>(null);
  useEffect(() => {
    let cancelled = false;
    billingRpc("my_subscription").then(({ data, error }) => {
      if (cancelled || error) return;
      const row = (Array.isArray(data) ? data[0] : data) as MySubscription | undefined;
      if (row && row.state) setSub(row);
    });
    return () => { cancelled = true; };
  }, []);
  return sub;
};
