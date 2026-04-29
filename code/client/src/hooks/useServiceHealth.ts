import { useCallback, useEffect, useMemo, useState } from "react";
import { SERVICE_HEALTH_URL } from "../services/api";

type ServiceState = "checking" | "healthy" | "api-down" | "neo4j-down";

interface HealthPayload {
  state: ServiceState;
  message: string;
  checkedAt: string | null;
}

const REQUEST_TIMEOUT_MS = 5000;
const RETRY_INTERVAL_MS = 10000;

export function useServiceHealth(): {
  state: ServiceState;
  message: string;
  checkedAt: string | null;
  loading: boolean;
  retry: () => Promise<void>;
} {
  const [health, setHealth] = useState<HealthPayload>({
    state: "checking",
    message: "Checking service health...",
    checkedAt: null,
  });
  const [loading, setLoading] = useState(false);

  const checkHealth = useCallback(async (): Promise<void> => {
    setLoading(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(SERVICE_HEALTH_URL, {
        method: "GET",
        signal: controller.signal,
      });

      if (!response.ok) {
        setHealth({
          state: "api-down",
          message: "API is reachable but returned an unhealthy response.",
          checkedAt: new Date().toISOString(),
        });
        return;
      }

      const payload = (await response.json()) as {
        api?: { up?: boolean };
        neo4j?: { up?: boolean };
      };
      const apiUp = payload.api?.up !== false;
      const neo4jUp = payload.neo4j?.up === true;

      if (!apiUp) {
        setHealth({
          state: "api-down",
          message: "API service is down.",
          checkedAt: new Date().toISOString(),
        });
        return;
      }

      if (!neo4jUp) {
        setHealth({
          state: "neo4j-down",
          message: "Neo4j database is down or unreachable.",
          checkedAt: new Date().toISOString(),
        });
        return;
      }

      setHealth({
        state: "healthy",
        message: "All services are healthy.",
        checkedAt: new Date().toISOString(),
      });
    } catch {
      setHealth({
        state: "api-down",
        message: "Unable to reach MedMemory API.",
        checkedAt: new Date().toISOString(),
      });
    } finally {
      window.clearTimeout(timeout);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void checkHealth();
    const timer = window.setInterval(() => {
      void checkHealth();
    }, RETRY_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [checkHealth]);

  const state = useMemo(() => health.state, [health.state]);

  return {
    state,
    message: health.message,
    checkedAt: health.checkedAt,
    loading,
    retry: checkHealth,
  };
}
