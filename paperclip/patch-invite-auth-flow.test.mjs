import test from 'node:test';
import assert from 'node:assert/strict';

import { patchInviteAuthFlowSource } from './patch-invite-auth-flow.mjs';

const brokenInviteAuthSuccess = 'onSuccess:async()=>{T(null),kae(i),await e.invalidateQueries({queryKey:z.auth.session});const Z=await e.fetchQuery({queryKey:z.companies.all,queryFn:()=>Jo.list(),retry:!1});if(F!=null&&F.companyId&&Z.some(Y=>Y.id===F.companyId)){HL(i),n(F.companyId,{source:"manual"}),t("/",{replace:!0});return}if(!(!F||F.inviteType!=="bootstrap_ceo"))try{const Y=await pe.mutateAsync();_ae(Y)&&t("/",{replace:!0})}catch{return}},onError:Z=>{const Y=KPt(Z,a,u);';

test('patchInviteAuthFlowSource accepts human invites before loading company list', () => {
  const source = `function invitePage(){const De=Ue({mutationFn:async()=>{},${brokenInviteAuthSuccess}})}`;

  const patched = patchInviteAuthFlowSource(source);

  const acceptIndex = patched.indexOf('const Z=await pe.mutateAsync();');
  const companiesIndex = patched.indexOf('e.fetchQuery({queryKey:z.companies.all');

  assert(acceptIndex > -1, 'patched source should accept the invite after auth');
  assert(companiesIndex > -1, 'patched source should preserve the company-list shortcut');
  assert(
    acceptIndex < companiesIndex,
    'invite acceptance must run before company-list fetch because invited non-members get 403',
  );
});

test('patchInviteAuthFlowSource is idempotent', () => {
  const source = `function invitePage(){const De=Ue({mutationFn:async()=>{},${brokenInviteAuthSuccess}})}`;
  const patched = patchInviteAuthFlowSource(source);

  assert.equal(patchInviteAuthFlowSource(patched), patched);
});
