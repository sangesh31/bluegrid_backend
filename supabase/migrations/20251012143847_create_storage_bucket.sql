-- Create storage bucket for pipe reports
insert into storage.buckets (id, name, public)
values ('pipe-reports', 'pipe-reports', true)
on conflict (name) do nothing;

-- Set up storage policies for the bucket
create policy "Public Access for pipe-reports bucket"
on storage.objects for select
to public
using (bucket_id = 'pipe-reports');

create policy "Allow insert for authenticated users"
on storage.objects for insert
to authenticated
with check (bucket_id = 'pipe-reports');

create policy "Allow update for authenticated users"
on storage.objects for update
to authenticated
using (bucket_id = 'pipe-reports');

create policy "Allow delete for authenticated users"
on storage.objects for delete
to authenticated
using (bucket_id = 'pipe-reports');
