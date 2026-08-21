'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getAuthHeaders } from '@/lib/api';

interface Space {
  id: string;
  name: string;
  slug: string;
}

export default function SpacesPage() {
  const [space, setSpace] = useState<Space | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSpace() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/spaces/me`,
          {
            headers: getAuthHeaders(),
          },
        );

        const data = await res.json();

        if (!res.ok) {
          setError(data?.message ?? 'Failed to load space.');
          return;
        }

        setSpace(data);
      } catch {
        setError('Network error — please try again.');
      } finally {
        setLoading(false);
      }
    }

    fetchSpace();
  }, []);

  if (loading) {
    return <div>Loading space...</div>;
  }

  if (error) {
    return <div className="text-red-600">{error}</div>;
  }

  if (!space) {
    return <div>No space found.</div>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Link
        href={`/dashboard/spaces/${space.id}`}
        className="border rounded p-4 bg-white shadow-sm hover:shadow-md transition"
      >
        <div className="font-medium">{space.name}</div>
        <div className="text-xs text-slate-400">{space.slug}</div>
      </Link>
    </div>
  );
}