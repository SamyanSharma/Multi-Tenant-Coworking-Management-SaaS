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
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSpaces() {
      setLoading(true);
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/spaces`, {
          headers: getAuthHeaders(),
        });
        if (!res.ok) {
          console.error('Failed to fetch spaces:', res.status, await res.text());
          setSpaces([]);
          return;
        }
        const data: Space[] = await res.json();
        setSpaces(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Network error fetching spaces:', err);
        setSpaces([]);
      } finally {
        setLoading(false);
      }
    }
    fetchSpaces();
  }, []);

  if (loading) return <div>Loading spaces…</div>;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      {spaces.map((space) => (
        <Link
          key={space.id}
          href={`/dashboard/spaces/${space.id}`}
          className="border rounded p-4 bg-white shadow-sm hover:shadow-md transition"
        >
          <div className="font-medium">{space.name}</div>
          <div className="text-xs text-slate-400">{space.slug}</div>
        </Link>
      ))}
    </div>
  );
}
