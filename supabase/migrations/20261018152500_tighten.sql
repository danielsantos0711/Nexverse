-- Trigger functions are not part of the API: nobody calls them over /rest/v1/rpc.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.check_accepted_answer() from public, anon, authenticated;

-- Deleting an answer clears it from any question that marked it as the one that worked.
create index questions_accepted_answer_idx on public.questions (accepted_answer_id);
