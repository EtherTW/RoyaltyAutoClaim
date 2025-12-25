<script setup lang="ts"></script>

<template>
	<div class="flex flex-col">
		<Header />

		<main class="flex-1 pt-14 pb-5">
			<router-view />
		</main>

		<FooterMeta />
	</div>
	<VueDapp />
	<Toast />
</template>
